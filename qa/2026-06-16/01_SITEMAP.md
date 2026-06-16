# SITEMAP — bun-base-template

Generated: 2026-06-16 13:30–14:00
Discovery oleh: AI QA Agent (claude-sonnet-4-6)
Tool: agent-browser CLI 0.27.0, curl

---

## ROLE: SUPER_ADMIN

### `/` (root)

- **Title**: Base Template
- **Auth**: public (redirect ke /dev jika sudah login sebagai SA)
- **Buttons**: "Sign In" (link ke /login), "Get Started" (link ke /login), "View Demo", "Start Building"
- **Modals**: "Pembaruan Aplikasi Versi 0.1.0" — muncul saat pertama load, dismiss via "Mengerti"
- **Console**: vite connect (info saja, bukan error) ✓
- **Screenshot desktop**: screenshots/discovery/desktop/sa-landing.png
- **Screenshot mobile**: screenshots/discovery/mobile/sa-landing.png
- **Catatan**: WhatsNew modal muncul saat pertama kali load. Dismiss berfungsi.

### `/login`

- **Title**: Base Template — Login
- **Auth**: public (redirect ke default route jika sudah login)
- **Forms**:
  - field: Email | type: email | required: ya
  - field: Password | type: password | required: ya
  - button: "Masuk" → `handleSubmit` → Better Auth signIn.email
  - button: "Login dengan Google" → OAuth
- **Error handling**: Alert Mantine `[role="alert"]` muncul saat login gagal (`"Invalid email or password"`)
- **Empty submit**: HTML5 native validation (required) — browser tooltip
- **API Calls**: `POST /api/auth/sign-in/email`
- **Console**: clean ✓
- **Screenshot desktop**: screenshots/discovery/desktop/guest-login.png
- **Screenshot mobile**: screenshots/discovery/mobile/guest-login.png
- **Catatan**: Error message muncul saat password salah (TC verified). Dark mode toggle berfungsi.

### `/dev` (SUPER_ADMIN only)

- **Title**: Base Template — Dev Console
- **Auth**: SUPER_ADMIN only; USER/ADMIN → redirect /profile
- **Layout**: AppShell dengan sidebar collapsible
- **Sidebar links**: Overview, Users, Tickets, App Logs, User Logs, Database, Project, File Health, API Docs, Settings | Apps: Dashboard, Pembaruan
- **Tabs aktif diverifikasi**:
  - Overview → stat cards (Total Users, Online, dsb.) ✓
  - Users → tabel user dengan kolom role/blocked ✓
  - Tickets → ticket list ✓
  - Database → ER diagram (@xyflow) ✓
  - App Logs → log entries ✓
  - File Health → file size scanner ✓
- **API Calls**: `/api/admin/users`, `/api/admin/presence`, `/api/tickets`, `/api/admin/logs/app`, `/api/admin/file-health`, `/api/admin/schema`
- **Console**: clean ✓
- **Screenshot desktop**: screenshots/discovery/desktop/sa-dev.png + sa-dev-users.png + sa-dev-tickets.png + sa-dev-database.png + sa-dev-applogs.png + sa-dev-filehealth.png
- **Screenshot mobile**: screenshots/discovery/mobile/sa-dev.png
- **Catatan**: Mobile view — sidebar collapse ke icon-only, konten tetap readable. 3600+ baris di `dev.tsx` (known SCALING.md issue).

---

## ROLE: ADMIN

### `/dashboard`

- **Title**: Base Template — Dashboard
- **Auth**: ADMIN + QC + SUPER_ADMIN; guest → redirect /login; USER → redirect /profile
- **Layout**: AppShell sidebar
- **Sidebar links**: Dashboard, Tickets, Analytics, Orders, Messages (badge "3"), Calendar, Settings, Pembaruan
- **Tabs terverifikasi**: Dashboard (stat cards), Tickets (ticket list dengan filter)
- **API Calls**: `/api/tickets`, `/api/auth/get-session`
- **Console**: clean ✓
- **Screenshot desktop**: screenshots/discovery/desktop/admin-dashboard.png + admin-dashboard-tickets.png
- **Screenshot mobile**: screenshots/discovery/mobile/admin-dashboard.png
- **Catatan**: Badge "Messages 3" — tampaknya statis/placeholder. Analytics, Orders, Calendar — link ada tapi belum ada konten aktif.

---

## ROLE: QC

### `/dashboard` (QC view)

- **Title**: Base Template — Dashboard
- **Auth**: sama dengan ADMIN
- **Catatan**: QC mendapat tampilan dashboard yang sama dengan ADMIN. Tiket yang ditampilkan sama (tidak ada QC-scoped filtering yang terlihat di UI). Backend `guardQcOrAdmin` membolehkan QC akses endpoint tickets.
- **Screenshot desktop**: screenshots/discovery/desktop/qc-dashboard.png
- **Screenshot mobile**: screenshots/discovery/mobile/qc-dashboard.png

---

## ROLE: USER

### `/profile`

- **Title**: Base Template — Profile
- **Auth**: semua role yang login; guest → redirect /login
- **Konten**: Halaman profil user (nama, email, avatar placeholder)
- **Console**: clean ✓
- **Screenshot desktop**: screenshots/discovery/desktop/user-profile.png
- **Screenshot mobile**: screenshots/discovery/mobile/user-profile.png
- **Catatan**: USER tidak punya akses ke /dashboard atau /dev — guard redirect ke /profile.

---

## ROLE: Guest (tanpa login)

### `/` (landing page)

- **Auth**: public
- **Catatan**: Semua CTA menuju /login. WhatsNew modal masih muncul untuk guest.

### Redirect behavior
- `/dashboard` → redirect ke `/login` ✓
- `/dev` → redirect ke `/login` ✓
- `/profile` → redirect ke `/login` ✓

---

## TEST CASE YANG DIEKSEKUSI (CH-3)

| TC | Skenario | Role | Hasil | Evidence |
| -- | -------- | ---- | ----- | -------- |
| UI-001 | Login email+password valid | SA | ✓ PASS — redirect ke /dev | sa-after-login.png |
| UI-002 | Login password salah | SA | ✓ PASS — Alert "Invalid email or password" | TC-login-wrong-password.png |
| UI-003 | Submit form kosong | guest | ✓ PASS — HTML5 native validation (required) | — |
| UI-004 | Dark mode toggle | guest | ✓ PASS — scheme berubah ke "dark" | TC-darkmode-toggle.png |
| UI-005 | USER akses /dev | USER | ✓ PASS — redirect ke /profile | TC-user-cannot-access-dev.png |
| UI-006 | ADMIN akses /dev | ADMIN | ✓ PASS — redirect ke /profile | — |
| UI-007 | guest akses /dashboard | guest | ✓ PASS — redirect ke /login | TC-guest-redirect-login.png |
| UI-008 | XSS payload di ticket title | SA | ✓ PASS — React escape, tidak di-execute | eval "ESCAPED_OK" |
| UI-009 | Sidebar collapse /dev | SA | ✓ PASS — sidebar collapsible | sa-dev.png |
| UI-010 | WhatsNew modal dismiss | guest | ✓ PASS — modal hilang setelah klik Mengerti | sa-landing.png |
| UI-011 | Mobile responsive /login | guest | ✓ PASS — layout ok, no horizontal scroll | guest-login (mobile) |
| UI-012 | Mobile /dev | SA | ✓ PASS — sidebar collapse, content readable | sa-dev (mobile) |
| UI-013 | Mobile /dashboard | ADMIN | ✓ PASS — layout ok di iPhone 14 | admin-dashboard (mobile) |
| UI-014 | /changelog render | ADMIN | ✓ PASS — changelog entries tampil | admin-changelog.png |
| UI-015 | /dashboard tab Tickets | ADMIN | ✓ PASS — ticket list tersedia | admin-dashboard-tickets.png |

Total CH-3 TC: 15 | Passed: 15 | Failed: 0 | Unclear: 0

---

## SUMMARY

- Total halaman diverifikasi: 7 (/, /login, /dev, /dashboard, /profile, /changelog, /blocked via redirect)
- Total role yang ditest: 5 (SA, ADMIN, QC, USER, guest)
- Total screenshot desktop: 15
- Total screenshot mobile: 7
- Total evidence screenshots: 3
- Total passed screenshots: 1
- Console error saat discovery: 0 (clean semua halaman)
- Auth guard redirect: 4 (USER→/dev→/profile, ADMIN→/dev→/profile, guest→/dashboard→/login, guest→/dev→/login) — semua benar ✓
- XSS rendering: React escape benar, script tidak di-execute ✓
- Responsive: Semua halaman utama OK di mobile iPhone 14 emulation ✓
- Area fragile: `dev.tsx` 3600+ baris (known), Messages badge "3" di sidebar tampak statis
