import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const repoFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe('mandatory first-login password change', () => {
  it('blocks every authenticated app route while the secure account flag is set', async () => {
    const app = await readFile(repoFile('src/App.tsx'), 'utf8');

    assert.match(app, /session\.user\.app_metadata\?\.must_change_password === true/);
    assert.match(app, /<ResetPassword required \/>/);
    assert.ok(
      app.indexOf('session.user.app_metadata?.must_change_password === true')
        < app.indexOf('<Routes>'),
      'the forced-password gate must run before protected routes render',
    );
  });

  it('changes the password through an authenticated server operation before clearing the flag', async () => {
    const endpoint = await readFile(repoFile('api/auth/complete-password-change.ts'), 'utf8');

    assert.match(endpoint, /caller\.auth\.getUser\(token\)/);
    assert.match(endpoint, /user\.app_metadata\?\.must_change_password !== true/);
    assert.match(endpoint, /service\.auth\.admin\.updateUserById\(user\.id/);
    assert.match(endpoint, /password,/);
    assert.match(endpoint, /\.\.\.user\.app_metadata/);
    assert.match(endpoint, /must_change_password: false/);
    assert.doesNotMatch(endpoint, /req\.body\?\.user/);
  });

  it('uses the required endpoint only for forced setup and retires the local session', async () => {
    const page = await readFile(repoFile('src/pages/ResetPassword.tsx'), 'utf8');

    assert.match(page, /if \(required\)/);
    assert.match(page, /fetch\('\/api\/auth\/complete-password-change'/);
    assert.match(page, /Authorization: `Bearer \$\{accessToken\}`/);
    assert.match(page, /signOut\(\{ scope: 'local' \}\)/);
    assert.match(page, /supabase\.auth\.updateUser\(\{ password \}\)/);
  });
});
