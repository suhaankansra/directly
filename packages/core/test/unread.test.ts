import { describe, expect, it } from 'vitest';
import { readUnread } from '../src/inpage/unread';
import { SelectorResolver } from '../src/inpage/selector';
import { parsePageMessage } from '../src/bridge';

function docWith(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const MOBILE = new SelectorResolver('mobile');

describe('readUnread', () => {
  it('returns null when there is no inbox link, because that is not "zero"', () => {
    expect(readUnread(docWith('<main><a href="/direct/t/1/">alice</a></main>'), MOBILE)).toBeNull();
  });

  it('reads the count out of the link label', () => {
    const doc = docWith('<a href="/direct/inbox/" aria-label="Direct messaging, 3 unread"><svg></svg></a>');
    expect(readUnread(doc, MOBILE)).toBe(3);
  });

  it('reads "new message(s)" wording too', () => {
    const doc = docWith('<a href="/direct/inbox/" aria-label="Messages, 2 new messages"></a>');
    expect(readUnread(doc, MOBILE)).toBe(2);
  });

  it('reads a rendered badge when the label carries no count', () => {
    const doc = docWith('<a href="/direct/inbox/"><svg></svg><span>7</span></a>');
    expect(readUnread(doc, MOBILE)).toBe(7);
  });

  it('caps the count at 99 and accepts "99+"', () => {
    expect(readUnread(docWith('<a href="/direct/inbox/"><span>99+</span></a>'), MOBILE)).toBe(99);
    expect(readUnread(docWith('<a href="/direct/inbox/"><span>480</span></a>'), MOBILE)).toBe(99);
  });

  it('does not read a conversation, only the inbox link', () => {
    const doc = docWith(`
      <a href="/direct/t/1/">alice<span>hey, are you around?</span><span>4</span></a>
    `);
    expect(readUnread(doc, MOBILE)).toBeNull();
  });

  it('ignores a link that merely says "Direct"', () => {
    const doc = docWith('<a href="/direct/inbox/" aria-label="Direct messaging"></a>');
    expect(readUnread(doc, MOBILE)).toBe(0);
  });

  it('fails open when the inbox link has no count at all', () => {
    const doc = docWith('<a href="/direct/inbox/"><svg aria-hidden="true"></svg></a>');
    expect(readUnread(doc, MOBILE)).toBe(0);
  });

  it('reads a badge that sits next to the link instead of inside it', () => {
    // Regression: Instagram renders the count as the link's sibling in the row.
    // Searching only the link's subtree reported 0, which the host reads as
    // "nothing unread" — so the badge flickered off while messages were waiting.
    const doc = docWith(`
      <nav role="navigation">
        <div id="row"><a href="/direct/inbox/"><svg></svg></a><span>3</span></div>
      </nav>`);
    expect(readUnread(doc, MOBILE)).toBe(3);
  });

  it('does not borrow a count from a container that also holds a conversation', () => {
    // The fallback must not turn into "read whatever number is nearby": here the
    // only count belongs to a thread row, so the honest answer is 0.
    const doc = docWith(`
      <nav role="navigation">
        <a href="/direct/inbox/"><svg></svg></a>
        <a href="/direct/t/1/">alice<span>4</span></a>
      </nav>`);
    expect(readUnread(doc, MOBILE)).toBe(0);
  });

  it('does not borrow a count from a container holding a composer', () => {
    const doc = docWith(`
      <div role="navigation">
        <a href="/direct/inbox/"><svg></svg></a>
        <span>9</span>
        <div role="textbox" contenteditable="true"></div>
      </div>`);
    expect(readUnread(doc, MOBILE)).toBe(0);
  });

  it('finds an inbox entry that is not an anchor', () => {
    // The href candidate list can miss entirely if the entry becomes a role=link
    // node; the label tier still identifies it, and the badge inside it counts.
    const doc = docWith(
      '<div role="link" aria-label="Direct messaging"><div><span>4</span></div></div>',
    );
    expect(readUnread(doc, MOBILE)).toBe(4);
  });

  it('reads the count from the parent row label', () => {
    const doc = docWith(`
      <div aria-label="Direct messaging, 6 unread">
        <a href="/direct/inbox/"><svg></svg></a>
      </div>`);
    expect(readUnread(doc, MOBILE)).toBe(6);
  });

  it('reads the desktop sidebar link', () => {
    const doc = docWith('<nav role="navigation"><a href="/direct/inbox/" aria-label="Direct messaging, 5 unread"></a></nav>');
    expect(readUnread(doc, new SelectorResolver('desktop'))).toBe(5);
  });
});

describe('di:unread protocol', () => {
  it('accepts a count', () => {
    expect(parsePageMessage({ v: 1, type: 'di:unread', count: 4 })).toEqual({
      v: 1,
      type: 'di:unread',
      count: 4,
    });
  });

  it('drops anything that is not a sane count', () => {
    expect(parsePageMessage({ v: 1, type: 'di:unread', count: -1 })).toBeNull();
    expect(parsePageMessage({ v: 1, type: 'di:unread', count: 1000 })).toBeNull();
    expect(parsePageMessage({ v: 1, type: 'di:unread', count: 2.5 })).toBeNull();
    expect(parsePageMessage({ v: 1, type: 'di:unread', count: '4' })).toBeNull();
    expect(parsePageMessage({ v: 1, type: 'di:unread' })).toBeNull();
  });

  it('carries no field a message could hide in', () => {
    const message = parsePageMessage({ v: 1, type: 'di:unread', count: 2, text: 'secret' });
    expect(message).toEqual({ v: 1, type: 'di:unread', count: 2 });
  });
});
