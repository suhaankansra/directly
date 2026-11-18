import { beforeEach, describe, expect, it } from 'vitest';
import { openAccountMenu } from '../src/inpage/accountMenu';
import { SelectorResolver } from '../src/inpage/selector';

function run(layout: 'mobile' | 'desktop' = 'mobile'): boolean {
  return openAccountMenu({ win: window, resolver: new SelectorResolver(layout) });
}

beforeEach(() => {
  document.body.innerHTML = `
    <header>
      <a href="/" id="logo"><img alt="Instagram"></a>
      <a href="#" id="whoami"><span>alice</span><svg aria-label="Down chevron icon"></svg></a>
    </header>
    <main><a href="/direct/t/1/">alice</a></main>
  `;
});

describe('openAccountMenu', () => {
  it("clicks the control around Instagram's chevron", () => {
    const anchor = document.getElementById('whoami')!;
    let clicks = 0;
    anchor.addEventListener('click', (event) => {
      clicks += 1;
      // The guard's own capture listener runs on the document; a click that does
      // not bubble would never reach React's delegated handler either.
      expect(event.bubbles).toBe(true);
    });

    expect(run()).toBe(true);
    expect(clicks).toBe(1);
  });

  it('says it could not open anything when the page has no chevron', () => {
    document.body.innerHTML = `<main><a href="/direct/t/1/">alice</a></main>`;
    expect(run()).toBe(false);
  });

  it('works on the desktop layout, which draws a different header', () => {
    document.body.innerHTML = `
      <div id="side"><span>bob</span><svg aria-label="Down chevron icon"></svg></div>`;
    expect(run('desktop')).toBe(true);
  });

  it('never throws into the page when the chevron has no wrapper', () => {
    // Nothing to click but the icon itself. It still gets an event, and any
    // failure is swallowed: an exception here would land in Instagram's script.
    document.body.innerHTML = `<svg id="loose" aria-label="Down chevron icon"></svg>`;
    expect(() => run()).not.toThrow();
  });
});
