import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const origin = process.env.MMA_TEST_URL || 'http://127.0.0.1:3210';
const { MMA_ADMIN_USERNAME, MMA_ADMIN_PASSWORD, MMA_SAMPLE_PASSWORD } = process.env;
assert(MMA_ADMIN_USERNAME && MMA_ADMIN_PASSWORD && MMA_SAMPLE_PASSWORD, 'Set temporary test credentials. Use a disposable sample database.');
const { chromium } = await import(process.env.MMA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.MMA_PLAYWRIGHT_PATH).href : 'playwright');
await mkdir('.check', { recursive: true });
const browser = await chromium.launch({ headless: true });
const issues = [];
const recordIssues = (page) => page.on('pageerror', (error) => issues.push(`${page.url()}: ${error.message}`));
const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible' });
const visit = (page, path) => page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
const day = (offset = 0) => {
  const local = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Asia/Manila', dateStyle: 'short' }).format(new Date());
  return new Date(Date.parse(`${local}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
};
async function login(user, password, role) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage(); recordIssues(page);
  await visit(page, '/login');
  await page.getByLabel('Student ID or username').fill(user);
  await page.locator('input[name=password]').fill(password);
  await Promise.all([page.waitForURL(`${origin}/${role}`), page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
  const cookie = (await ctx.cookies()).find((x) => x.name === 'mma_session');
  assert(cookie?.httpOnly, 'Session cookie should be HttpOnly');
  const csrf = createHash('sha256').update(`mma-csrf-v1:${cookie.value}`).digest('hex');
  const headers = { Origin: origin, 'X-MMA-Request': '1', 'X-MMA-CSRF': csrf };
  return { ctx, page, headers };
}
async function command(identity, action, data, expected = 200) {
  const response = await identity.ctx.request.post(`${origin}/api/workspace/${action}`, { data, headers: identity.headers });
  const body = await response.json();
  assert.equal(response.status(), expected, `${action}: ${JSON.stringify({ error: body.error, message: body.message })}`);
  return body;
}
async function pdf(page, name = 'Download PDF') {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
  const bytes = await readFile(await file.path());
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  assert(bytes.length > 1500, 'The PDF should include report content.');
}

try {
  const preview = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const home = await preview.newPage(); recordIssues(home);
  await visit(home, '/');
  await heading(home, 'Dashboard Overview');
  await home.getByText('1,248', { exact: true }).waitFor({ state: 'visible' });
  await home.evaluate(() => document.fonts.ready);
  const chartDrawn = await home.locator('canvas').evaluate(async (canvas) => {
    for (let wait = 0; wait < 30; wait++) {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i += 4) if (data[i] === 37 && data[i + 1] === 60 && data[i + 2] === 99 && data[i + 3] === 255) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  });
  assert(chartDrawn, 'Chart.js should draw the attendance series.');
  await home.screenshot({ path: '.check/dashboard.png' });
  await home.getByRole('combobox', { name: 'Attendance chart date' }).selectOption('2026-09-15');
  await home.getByText('942', { exact: true }).waitFor({ state: 'visible' });
  await home.getByRole('combobox', { name: 'Intramurals season' }).selectOption('2025');
  await heading(home, 'MMA Intramurals 2025');
  await home.getByRole('link', { name: 'Students', exact: true }).click();
  await heading(home, 'Students');
  await home.getByPlaceholder('Search name or Student ID…').fill('Sofia');
  assert.equal(await home.locator('tbody tr').count(), 1);
  await home.getByRole('button', { name: 'Add student', exact: true }).click();
  await heading(home, 'Sign in to make changes');
  await home.getByRole('button', { name: 'Close dialog' }).click();
  await home.getByRole('button', { name: 'Account menu' }).click();
  await home.getByRole('link', { name: 'Student', exact: true }).click();
  await heading(home, 'Student Dashboard');
  await visit(home, '/admin/students');
  await heading(home, 'Sign in to your workspace');
  const guest = await preview.request.post(`${origin}/api/workspace/attendance.scan`, { data: { code: 'sample' }, headers: { Origin: origin, 'X-MMA-Request': '1' } });
  assert.equal(guest.status(), 401);
  console.log('PASS: preview, date and season navigation, search, protected routes');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mp = await mobile.newPage(); recordIssues(mp);
  await visit(mp, '/'); await heading(mp, 'Dashboard Overview');
  await mp.evaluate(() => document.fonts.ready);
  assert(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Dashboard must fit mobile viewport.');
  await mp.screenshot({ path: '.check/mobile.png', fullPage: true });
  await mp.getByRole('button', { name: 'Open sidebar' }).click();
  await mp.getByRole('link', { name: 'Public Website' }).click();
  await mp.getByRole('heading', { name: 'Game Schedule' }).waitFor({ state: 'attached' });
  await mp.locator('.public-more summary').click();
  await mp.getByRole('link', { name: 'Gallery', exact: true }).click();
  assert.equal(new URL(mp.url()).hash, '#gallery');
  assert(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Public page must fit mobile viewport.');
  console.log('PASS: mobile dashboard and mobile public navigation');

  const admin = await login(MMA_ADMIN_USERNAME, MMA_ADMIN_PASSWORD, 'admin');
  const student = await login('2026-1001', MMA_SAMPLE_PASSWORD, 'student');
  const secondStudent = await login('2026-1002', MMA_SAMPLE_PASSWORD, 'student');
  const adviser = await login('msantos', MMA_SAMPLE_PASSWORD, 'adviser');
  await heading(admin.page, 'Dashboard Overview'); await heading(student.page, 'Student Dashboard'); await heading(adviser.page, 'Adviser Dashboard');
  await visit(student.page, '/admin/settings'); await heading(student.page, 'Student Dashboard');
  await visit(adviser.page, '/adviser/students'); await heading(adviser.page, 'House Members');
  await adviser.page.getByText('Liam Villanueva', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await adviser.page.getByText('Sofia Mendoza', { exact: true }).count(), 0);
  await command(student, 'student.save', {}, 403);
  await command(adviser, 'score.save', {}, 403);
  const badCsrf = await admin.ctx.request.post(`${origin}/api/workspace/attendance.generate`, { headers: { ...admin.headers, 'X-MMA-CSRF': '0'.repeat(64) }, data: { eventId: 1, type: 'in', minutes: 5 } });
  assert.equal(badCsrf.status(), 403);
  console.log('PASS: actual account login, role redirects, adviser house scoping and write guards');

  await visit(admin.page, '/admin/students');
  await admin.page.getByRole('button', { name: 'Add student', exact: true }).click();
  const modal = admin.page.getByRole('dialog');
  await modal.getByLabel(/Student ID/).fill('QA-2026-001');
  await modal.getByLabel(/First name/).fill('Test');
  await modal.getByLabel(/Last name/).fill('Applicant');
  await modal.getByLabel(/Course or department/).fill('Test department');
  await modal.getByLabel(/House assignment/).selectOption('1');
  await modal.getByLabel(/Initial password/).fill(MMA_SAMPLE_PASSWORD);
  await modal.getByRole('button', { name: 'Register student', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await visit(admin.page, '/admin/students');
  await admin.page.getByPlaceholder('Search name or Student ID…').fill('QA-2026-001');
  await admin.page.getByText('Test Applicant', { exact: true }).waitFor({ state: 'visible' });
  await admin.page.getByRole('button', { name: 'Edit Test Applicant' }).click();
  await modal.getByLabel(/First name/).fill('Updated');
  await modal.getByRole('button', { name: 'Save student' }).click();
  await admin.page.getByText('Updated Applicant', { exact: true }).waitFor({ state: 'visible' });
  const csv = 'Student ID,First Name,Last Name,Course,Year Level,House\nQA-CSV-01,CSV,Import,Test department,1,Red House\n';
  const upload = (filename, mimeType, buffer) => admin.ctx.request.post(`${origin}/api/workspace/student.import`, { headers: admin.headers, multipart: { eventId: '1', file: { name: filename, mimeType, buffer } } });
  const csvResult = await upload('students.csv', 'text/csv', Buffer.from(csv));
  assert.equal(csvResult.status(), 200, await csvResult.text());
  const dupe = await upload('students.csv', 'text/csv', Buffer.from(csv));
  assert.equal(dupe.status(), 409);
  if (process.env.MMA_XLSX_FIXTURE) {
    const xlsxResult = await upload('students.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', await readFile(process.env.MMA_XLSX_FIXTURE));
    assert.equal(xlsxResult.status(), 200, await xlsxResult.text());
  }
  await command(admin, 'house.save', { name: 'Violet House', active: true, color: '#7c58b6', emblem: 'shield', description: 'QA house', eventId: 1, inSeason: true });
  console.log('PASS: student register and edit in browser, transactional CSV import, house enrollment' + (process.env.MMA_XLSX_FIXTURE ? ', XLSX import' : ''));

  const jpeg = await readFile('public/images/arena-hero.jpg');
  async function uploadImage(action, data, expected = 200, body = jpeg) {
    const res = await admin.ctx.request.post(`${origin}/api/workspace/${action}`, { headers: admin.headers, multipart: { ...data, file: { name: 'sample.jpg', mimeType: 'image/jpeg', buffer: body } } });
    const result = await res.json();
    assert.equal(res.status(), expected, `${action}: ${result.error || result.message}`);
    return result;
  }
  await uploadImage('school.logo', {}, 400, Buffer.from('not an image'));
  const schoolLogo = await uploadImage('school.logo', {});
  const schoolImage = await home.request.get(`${origin}${schoolLogo.url}`);
  assert.equal(schoolImage.headers()['content-type'], 'image/webp');
  const studentPhoto = await uploadImage('student.photo', { id: '2' });
  assert.equal((await home.request.get(`${origin}${studentPhoto.url}`)).status(), 404);
  assert.equal((await student.ctx.request.get(`${origin}${studentPhoto.url}`)).status(), 404);
  assert.equal((await secondStudent.ctx.request.get(`${origin}${studentPhoto.url}`)).status(), 200);
  assert.equal((await adviser.ctx.request.get(`${origin}${studentPhoto.url}`)).status(), 200);
  const galleryImage = await uploadImage('gallery.upload', { eventId: '1', caption: 'QA image from the gym', publish: 'on' });
  assert.equal((await home.request.get(`${origin}${galleryImage.url}`)).status(), 404);
  console.log('PASS: restricted photo uploads, school logo re-encoding, and private image access');

  const out = await command(admin, 'attendance.generate', { eventId: 1, type: 'out', minutes: 5 });
  await command(student, 'attendance.scan', { code: out.code }, 409);
  const input = await command(admin, 'attendance.generate', { eventId: 1, type: 'in', minutes: 5 });
  assert.match(input.image, /^data:image\/png;base64,/);
  await visit(student.page, '/student/scan');
  await heading(student.page, 'Scan Attendance QR');
  const png = Buffer.from(input.image.split(',')[1], 'base64');
  const readyQrInput = student.page.locator('input[type=file]:not(:disabled)');
  await readyQrInput.waitFor({ state: 'attached' });
  await readyQrInput.setInputFiles({ name: 'official-qr.png', mimeType: 'image/png', buffer: png });
  await student.page.getByText(/^TIME IN recorded at/, { exact: false }).first().waitFor({ state: 'visible' });
  await command(student, 'attendance.scan', { code: input.code }, 409);
  const concurrent = await Promise.all([0, 1].map(() => secondStudent.ctx.request.post(`${origin}/api/workspace/attendance.scan`, { headers: secondStudent.headers, data: { code: input.code } })));
  assert.deepEqual(concurrent.map((r) => r.status()).sort(), [200, 409]);
  await student.page.getByPlaceholder('Paste the full code').fill(out.code);
  await student.page.getByRole('button', { name: 'Submit code' }).click();
  await student.page.getByText(/^TIME OUT recorded at/, { exact: false }).first().waitFor({ state: 'visible' });
  await command(student, 'attendance.scan', { code: out.code }, 409);
  await command(admin, 'attendance.close', { eventId: 1, id: out.id });
  await command(student, 'attendance.scan', { code: out.code }, 410);
  await visit(student.page, '/student/attendance');
  await heading(student.page, 'My Attendance');
  assert((await student.page.locator('tbody tr').count()) > 1);
  await command(admin, 'attendance.correct', { eventId: 1, studentId: 2, date: day(), status: 'excused', reason: 'Verified test correction' });
  await visit(admin.page, '/admin/settings');
  await admin.page.getByRole('button', { name: 'Audit log' }).click();
  await admin.page.getByText('Verified test correction', { exact: true }).waitFor({ state: 'visible' });
  await visit(adviser.page, '/adviser/reports'); await pdf(adviser.page);
  await adviser.page.getByRole('button', { name: 'Team participation' }).click(); await pdf(adviser.page);
  console.log('PASS: QR generation, image scanning, paste submission, concurrent deduplication, time out, correction audit, scoped PDF exports');

  await command(admin, 'match.save', { eventId: 1, date: day(), startTime: '10:30', endTime: '11:15', sportId: 1, homeId: 1, awayId: 2, venueId: 1, officialId: 1, stage: 'QA fixture', format: 'round_robin' }, 409);
  await command(admin, 'tournament.generate', { eventId: 1, date: day(2), startTime: '07:00', minutes: 30, sportId: 5, venueId: 3, name: 'QA round robin' });
  await command(admin, 'score.save', { eventId: 1, id: 1, status: 'completed', home: 42, away: 39 });
  await command(admin, 'points.save', { eventId: 1, placement: 1, points: 12 });
  await command(admin, 'notice.save', { eventId: 1, title: 'Private staff notice marker', body: 'This text must not appear publicly.', audience: 'workspace', publish: true });
  await command(admin, 'notice.save', { eventId: 1, title: 'Public schedule notice marker', body: 'View the schedule for further details.', audience: 'public', publish: true });
  await command(admin, 'season.save', { id: 1, title: 'MMA Training Intramurals', slug: 'training-season', schoolYear: 'Test year', location: 'MMA Sports Complex', startDate: day(-2), endDate: day(3), state: 'active', published: true, cutoff: '08:00' });
  await visit(home, '/public');
  await heading(home, 'MMA Training Intramurals');
  await home.getByText('Public schedule notice marker', { exact: true }).waitFor({ state: 'attached' });
  assert.equal(await home.getByText('Private staff notice marker', { exact: true }).count(), 0);
  assert.equal(await home.getByText('Sofia Mendoza', { exact: true }).count(), 0);
  await home.getByText('42 – 39', { exact: true }).waitFor({ state: 'attached' });
  await home.getByRole('img', { name: 'QA image from the gym' }).waitFor({ state: 'attached' });
  assert.equal((await home.request.get(`${origin}${galleryImage.url}`)).status(), 200);
  await command(admin, 'gallery.save', { eventId: 1, id: galleryImage.id, caption: 'QA image from the gym', publish: false });
  assert.equal((await home.request.get(`${origin}${galleryImage.url}`)).status(), 404);
  console.log('PASS: scheduling conflict, round robin, score, configured points, publication without private records');

  await admin.page.getByRole('button', { name: 'Account menu' }).click();
  await Promise.all([admin.page.waitForURL(`${origin}/login`), admin.page.getByRole('button', { name: 'Sign out', exact: true }).click()]);
  assert(!(await admin.ctx.cookies()).some((c) => c.name === 'mma_session'));
  await visit(admin.page, '/admin'); await heading(admin.page, 'Sign in to your workspace');
  assert.deepEqual(issues, [], 'No uncaught browser exceptions');
  console.log('PASS: session revocation and browser error checks');
} finally { await browser.close(); }
