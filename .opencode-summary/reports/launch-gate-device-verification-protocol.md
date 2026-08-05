# 📱 Launch Gate — Real-Device Verification Protocol (Android) + Evidence Template

- **Status:** READY — to be executed by the human tester on a real Android device
- **Report date:** 2026-08-05
- **Purpose:** Final gate to formally close the two Launch Blockers. jsdom cannot simulate Deep Links, Browser History, WhatsApp, Popup Policies, Mobile Navigation, PWA Navigation — this protocol covers them on hardware.
- **Evidence required:** video, or a sequence of screenshots with visible on-device clock/timestamp, for every step.

---

## 0. Prepare the test environment

### 0.1 Serve the production build to the phone

Option A — LAN preview of the built app (phone and PC on the same Wi-Fi):

```powershell
# from E:\dll\focus\focus22
.\node_modules\.bin\vite.cmd preview --host
```

- The terminal prints a LAN URL, e.g. `http://192.168.1.50:4173/`. Open the Windows firewall prompt if asked.
- On the phone, open that URL in Chrome. (Service Worker / PWA install requires HTTPS or localhost, so for the **PWA install** items use Option B/C.)

Option B — HTTPS/dev server on LAN:
```powershell
.\node_modules\.bin\vite.cmd dev --host
```

Option C — deployed HTTPS URL (preferred for PWA items): use the existing production URL if available.

### 0.2 Test URLs

| Name | URL to scan / open |
|------|--------------------|
| Campaign deep link (game test) | `http://<HOST>/` with **`?campaign=test-campaign&source=qr`** |
| Short-code deep link (QR counter test) | `http://<HOST>/c/<6-char-code>` (only if a campaign short code exists in the DB; else use the query-param URL above) |

### 0.3 QR code for the phone

The repo includes `qrcode` (`package.json`). Once the exact host URL is known, generate a scannable QR (executed on request, or run locally):

```powershell
# example (PowerShell) using the project's qrcode package
node -e "const QR=require('qrcode');QR.toFile('test-qr.png','http://192.168.1.50:4173/?campaign=test-campaign&source=qr',{width:512,margin:2}).then(()=>console.log('ok'))"
```

> The assistant will generate `test-qr.png` on request as soon as the host URL is provided.

---

## 1. Game — auto-restart fix (10s watch after every return home)

Execute in order. Record **video continuously** (screen recorder with on-device clock), or a screenshot per step with timestamps.

| # | Step | Expected result | Evidence |
|---|------|-----------------|----------|
| G1 | Open the app **from the QR** (campaign URL). | App loads; game-intro appears automatically (QR flow fired **once**). | 📷 |
| G2 | Let the game start; press **Stop** → confirm. | Lands on **home**. | 📷 |
| G3 | **Wait 10 seconds** on home. | **No** game start, **no** game-intro. | 📷 |
| G4 | Open **Showroom** (معرض الهواتف), browse, return to home. | Home; no game start. | 📷 |
| G5 | **Wait 10 seconds.** | **No** game start. | 📷 |
| G6 | Open **Repair** screen, browse, return home. | Home; no game start. | 📷 |
| G7 | **Wait 10 seconds.** | **No** game start. | 📷 |
| G8 | Play a **complete match** (all 7 rounds) to the results screen. | Results screen shows normally. | 📷 |
| G9 | Press **Home / Save & Exit**. | Lands on home. | 📷 |
| G10 | **Wait 10 seconds.** | **No** game start. | 📷 |
| G11 | Press **Play Again** (or start a new test). | Game starts — **only** here. | 📷 |

**Gate:** every `G1–G10` "no start" row passes, and `G11` proves the game still starts deliberately.

---

## 2. WhatsApp — all four request types

For each type (repair / sell / buy / exchange): submit the request and tap the WhatsApp/send button. Record the recipient number and the full message.

| # | Flow | Expected result | Evidence |
|---|------|-----------------|----------|
| W1 | **Repair** request → send via WhatsApp. | WhatsApp opens **directly** (new tab/app; same-tab fallback if popup blocked). Recipient: **+213 556 25 40 07**. Message: **100% clean Arabic** — `السلام عليكم` + هاتف/حالة/عطل/رقم الطلب/رقم العميل. | 📷 message screenshot |
| W2 | **Sell** request → send. | Same number; clean Arabic (`أرغب في بيع الهاتف التالي`). | 📷 |
| W3 | **Buy** request → send. | Same number; clean Arabic (`أرغب في شراء الهاتف التالي`). | 📷 |
| W4 | **Exchange** request → send. | Same number; clean Arabic (`أرغب في استبدال هاتفي`). | 📷 |

### Mojibake / encoding inspection (per message)

The screenshot must show readable Arabic. For an additional byte-level check, tap the WhatsApp message → copy the text → paste into a UTF-8-aware editor and verify **all** of:

- ❌ No `Ø§Ù„Ø³Ù„Ø§Ù…`-style garbage (mojibake).
- ❌ No `%D8%...` literal percent-sequences (double encoding / un-decoded URL).
- ❌ No Base64 strings (`PHNw...`, `4oC...`, etc.).
- ❌ No unreadable tokens / unintended encoding.
- ✅ Correct number: `+213 556 25 40 07` (`wa.me/213556254007`).

**Gate:** all four flows open WhatsApp with the right number and 100% clean Arabic.

---

## 3. PWA + session sanity (bonus, strengthens the regression gate)

| # | Step | Expected | Evidence |
|---|------|----------|----------|
| P1 | Open the HTTPS URL → **Install app / Add to Home screen**. | Install prompt / PWA installs. | 📷 |
| P2 | Cold-launch from the home-screen icon. | App opens at home, no QR auto-start (URL has no campaign params on a normal launch). | 📷 |
| P3 | Scan the campaign QR **again** in a fresh launch. | QR flow fires once, game starts. | 📷 |
| P4 | Check QR scan counter / campaign attribution (admin: campaigns/analytics). | Scan count increments by **1** for the fresh scan (not by N from repeated home returns). | 📷 |

---

## 4. Evidence return format

Return the video file(s) or screenshots plus this filled table (one row per step, or a single continuous video covering all steps in order):

```
Tester:            Device (model/Android version):   Date:
URL used:          Browser: (Chrome/WhatsApp version if relevant)

G1..G11:  PASS/FAIL  (attach media per step)
W1..W4:   PASS/FAIL  (attach message screenshot per flow)
P1..P4:   PASS/FAIL  (attach media per step)
```

---

## 5. What happens after this gate

When the tester marks every checklist item PASS with recorded evidence, the reviewer formally closes the Launch Blockers and authorizes **Stage C (inventory / used phones)**. Until then: **Stage C remains fully frozen** — no migration, no Supabase change.
