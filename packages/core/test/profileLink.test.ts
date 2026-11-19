import { beforeEach, describe, expect, it } from 'vitest';
import { ownProfilePath } from '../src/inpage/profileLink';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('ownProfilePath', () => {
  it('reads the handle from the account chrome avatar', () => {
    document.body.innerHTML = `
      <header>
        <a href="/alice/" role="link"><img alt="alice's profile picture"></a>
      </header>
      <main><a href="/bob/" role="link"><img alt="bob's profile picture"></a></main>`;
    expect(ownProfilePath(document)).toBe('/alice/');
  });

  it('finds it outside <header> too, as long as it is not in the content', () => {
    document.body.innerHTML = `
      <div id="chrome">
        <a href="/carol/"><img alt="carol's profile picture"></a>
      </div>`;
    expect(ownProfilePath(document)).toBe('/carol/');
  });

  it('never returns the person you are talking to', () => {
    // A thread lists the other account's avatar first; opening their profile
    // from our Profile tab was a real bug this check prevents.
    document.body.innerHTML = `
      <main>
        <a href="/bob/"><img alt="bob's profile picture"></a>
      </main>`;
    expect(ownProfilePath(document)).toBeNull();
  });

  it('requires the alt text to name the same handle as the href', () => {
    document.body.innerHTML = `
      <header><a href="/alice/"><img alt="suggested for you"></a></header>`;
    expect(ownProfilePath(document)).toBeNull();
  });

  it("uses Instagram's own Profile nav item when no avatar is rendered", () => {
    // The inbox and a thread show no avatar of yours; their bottom navigation
    // still links to your profile, which is what the tab needs.
    document.body.innerHTML = `
      <nav role="navigation">
        <a href="/direct/inbox/" aria-label="Messages">Messages</a>
        <a href="/dana/" aria-label="Profile">Profile</a>
      </nav>`;
    expect(ownProfilePath(document)).toBe('/dana/');
  });

  it('ignores a Profile label that does not point at a single handle', () => {
    document.body.innerHTML = `
      <nav><a href="/accounts/edit/" aria-label="Profile">Profile</a></nav>`;
    expect(ownProfilePath(document)).toBeNull();
  });

  it('is null on a page with no profile link at all', () => {
    document.body.innerHTML = `<main><textarea></textarea></main>`;
    expect(ownProfilePath(document)).toBeNull();
  });
});
