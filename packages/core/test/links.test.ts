import { describe, expect, it } from 'vitest';
import { classifyLink, isInstagramHost } from '../src/links';

const kind = (url: string) => classifyLink(url).kind;

describe('classifyLink', () => {
  it('treats every Instagram subdomain as Instagram, not as a foreign site', () => {
    expect(kind('https://www.instagram.com/direct/inbox/')).toBe('instagram');
    expect(kind('https://instagram.com/alice/')).toBe('instagram');
    // Accounts Center is reached from the activity tab and is still Instagram.
    expect(kind('https://accountscenter.instagram.com/accounts/')).toBe('instagram');
    expect(isInstagramHost('m.instagram.com')).toBe(true);
  });

  it('does not mistake a lookalike host for Instagram', () => {
    expect(isInstagramHost('notinstagram.com')).toBe(false);
    expect(isInstagramHost('instagram.com.evil.test')).toBe(false);
    expect(kind('https://instagram.com.evil.test/direct/inbox/')).toBe('external');
  });

  it('unwraps the l.instagram.com link shim to the real destination', () => {
    const external = classifyLink(
      'https://l.instagram.com/?u=https%3A%2F%2Fwww.facebook.com%2Fsomepage&e=abc',
    );
    // The point of the report: a Facebook link is opened as the Facebook page,
    // not as the shim that used to be punted to Safari.
    expect(external).toMatchObject({ kind: 'external', url: 'https://www.facebook.com/somepage' });

    const internal = classifyLink(
      'https://l.instagram.com/?u=https%3A%2F%2Fwww.instagram.com%2Fdirect%2Finbox%2F',
    );
    expect(internal).toMatchObject({
      kind: 'instagram',
      url: 'https://www.instagram.com/direct/inbox/',
      unwrapped: true,
    });
  });

  it('survives a shim that points at another shim, but not forever', () => {
    const once = 'https://l.instagram.com/?u=' + encodeURIComponent('https://l.instagram.com/?u=');
    expect(kind(once)).toBe('instagram');
    expect(kind('https://l.instagram.com/')).toBe('instagram');
  });

  it('recognises the Facebook login dialog as a sign-in attempt', () => {
    expect(kind('https://www.facebook.com/v19.0/dialog/oauth?client_id=1')).toBe('meta-login');
    expect(kind('https://m.facebook.com/dialog/oauth?client_id=1')).toBe('meta-login');
    expect(kind('https://www.facebook.com/login.php')).toBe('meta-login');
    // A friend's Facebook page is a link, not a sign-in.
    expect(kind('https://www.facebook.com/somepage')).toBe('external');
  });

  it('keeps other sites external and refuses garbage', () => {
    expect(kind('https://example.com/')).toBe('external');
    expect(kind('javascript:alert(1)')).toBe('invalid');
    expect(kind('not a url')).toBe('invalid');
    expect(kind('http://www.instagram.com/direct/inbox/')).toBe('external');
  });
});
