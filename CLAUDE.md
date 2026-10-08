# CLAUDE.md — לחם ושמש

הנחיות עבודה קבועות ל-Claude Code בפרויקט הזה. קרא לפני כל שינוי משמעותי. כללים עסקיים תמיד מנצחים — אם קוד או UX סותרים אותם, הקוד טעה.

---

## מה זה הפרויקט

אתר תדמית והזמנות חד-עמודי (Single Page) למאפיית **לחם ושמש**, מאפייה שכונתית בהדר, חיפה, פעילה מ-2019. אופה לחמי מחמצת, לחמים, חלות ומאפים — הכול נאפה באותו בוקר.

המטרה המרכזית: להשיק ולהריץ שירות **משלוחי בוקר שכונתי**, ולתת ללקוח להבין תוך שניות מה אפשר להזמין, לאן מגיעים משלוחים, עד מתי מזמינים, מתי המשלוח מגיע, כמה זה עולה, ואיך משאירים הזמנה.

עדיפויות כשיש טרייד-אוף (מהחשוב לפחות חשוב):

1. אמינות ההזמנה
2. Mobile UX
3. מהירות טעינה
4. בהירות המידע
5. Accessibility
6. תחזוקתיות
7. Polish ויזואלי
8. Features נוספים

זהו אתר קטן לעסק מקומי אחד. מורכבות היא עלות — ראה [Do Not Overengineer](#do-not-overengineer).

---

## מבנה הפרויקט (מצב נוכחי בפועל)

```
index.html          עמוד יחיד — כל האתר
api/index.js         Vercel Function אחת שמגישה את index.html ("/") עם המחירים העדכניים מ-price_list כבר בתוך ה-HTML
vercel.json          routes: "/" ו-"/admin" לפונקציות, חסימת /private/, includeFiles
api/admin.js         "/admin": דף כניסה, ולמחוברים — דף מערכת המאפייה (העלאת חשבוניות/מחירונים/מסמכים)
api/login.js         POST /api/login — בדיקת שם משתמש וסיסמה בשרת ויצירת עוגיית session חתומה
api/logout.js        GET /api/logout — ניקוי העוגייה
lib/session.js      יצירה ואימות של עוגיית ה-session (HMAC, תוקף 8 שעות)
api/docs.js          /api/docs?action=upload|process|verify|activate|list — העלאת מחירון/מסמך "אחר" לחנות הידע עם החלפה בטוחה (דורש session)
lib/docs/            הלוגיקה של ההחלפה הבטוחה (pipeline, chunker, prices, לקוחות Supabase/OpenAI/LlamaParse)
docs/                תיעוד פנימי (חסום ב-vercel.json, לא מוגש לציבור): rag-pipeline (SQL ורשימת פריסה), rag-test (מבחן הבוט), superpowers (תכנון)
test/                בדיקות node:test ושרת תצוגה מקומי עם שירותים מדומים — להריץ: node --test "test/*.test.js"
private/            login.html, admin.html — מוגשים רק דרך api/admin.js (גישה ישירה נחסמת ב-404)
css/styles.css       כל ה-CSS (custom properties, mobile-first)
js/script.js          כל ה-JS (config, validation, submission)
תמונות/               קבצי המקור המקוריים של כל הנכסים הוויזואליים (backup/source of truth)
מידע לסוכן/            מסמכי מידע ללקוחות, להעלאה כ"אחר" לחנות הידע של הסוכן (בלי מידע רגיש ובלי מחירים — הם במחירון)
מחירונים/              קבצי מחירון לבדיקות (v1 = המחירון הנוכחי; v2–v4 עם מחירים ודמי משלוח שנוספו לבדיקה בלבד)
assets/               ריק כרגע — לא בשימוש, שריד מלפני מעבר ל-Cloudinary
.gitignore
```

אין build step, אין bundler, אין package.json, אין framework. זה מכוון — ראה [Stack](#stack).

---

## Stack

* HTML5 + CSS3 + Vanilla JavaScript בלבד. שלושת הקבצים לעיל הם כל האתר.
* אין להעביר את הפרויקט ל-React / Next.js או לכל framework אחר.
* אין להוסיף build system, bundler, dependency או package manager שאפשר להימנע ממנו.
* אם נדרש קוד שרת קטן לאינטגרציה עתידית — Vercel Functions / Serverless Functions בלבד.
* מותר להוסיף טכנולוגיה נוספת רק כשיש לה יתרון ממשי וברור, לא כי היא זמינה.

---

## Deployment

* האתר פרוס ב-**Vercel**. כל שינוי חייב להישאר תואם לפריסה ב-Vercel. הדף הראשי ("/") מוגש דרך Vercel Function אחת (`api/index.js`) שמזריקה את המחירים; שאר הקבצים (css, js, תמונות) סטטיים. אם הפונקציה נכשלת או שמבנה ה-HTML השתנה, מוגש `index.html` כמו שהוא.
* אין כרגע (ולא נדרש כרגע): database, authentication, מערכת משתמשים, payment gateway, CMS, inventory system.

---

## Language & Direction

* עברית בלבד, `lang="he"`, `dir="rtl"` מלא.
* אין גרסה באנגלית ואין language switcher.
* כל רכיב — navigation, cards, buttons, forms, הודעות ולידציה, אייקונים, spacing, alignment, mobile layouts — מתוכנן ל-RTL מראש.
* **מספרים, מחירים, טלפונים ותאריכים באנגלית/ספרות:** ה-bidi algorithm של הדפדפן בדרך כלל מציג רצפי ספרות נכון בתוך טקסט RTL, אבל אם נתקלים בבעיה ויזואלית (למשל טלפון או מחיר שמתהפך) — יש לבודד עם `dir="ltr"` או `<bdi>` סביב הערך הספציפי, לא סביב כל האלמנט. אל תהפכו ידנית (reverse) מחרוזות מספרים בקוד בשום מקרה.
* אל תמראו (mirror) לוגו, תמונות מוצר, checkmarks, או אייקונים לא-כיווניים. מרירו רק אלמנטים כיווניים אמיתיים (חצים של ניווט/back).

---

## Business Information

* שם: לחם ושמש
* מיקום: שכונת הדר, חיפה
* פעילה מאז: 2019
* מסר מרכזי: מאפייה שכונתית שאופה בבוקר ומביאה לחם ומאפים טריים לתושבי השכונה בשעות הבוקר.

---

## Products (source of truth — אל תשנה בלי אישור מפורש)

| מוצר | מחיר | הערה |
|---|---|---|
| לחם כפרי מחמצת | 32 ₪ | |
| לחם שיפון | 36 ₪ | |
| חלה | 28 ₪ | **זמינה בימי שישי בלבד** |
| בורקס גבינה | 12 ₪ | ליחידה |

אל תשנה מחירים, אל תמציא מוצרים/וריאציות/גדלים/תוספות/מבצעים שלא הוגדרו כאן.

**מחירים דינמיים:** המחירים בפועל נקראים מהטבלה `price_list` ב-Supabase, והיא מתעדכנת בכל העלאת מחירון (דף העלאת המסמכים, סוג "מחירון"). הטבלה למעלה והמחירים הכתובים ב-`index.html` הם ברירת מחדל וגיבוי בלבד (לכשל בטעינה, ולמנועי חיפוש). כשמחירי הברירת מחדל משתנים בפועל, מעדכנים גם את `index.html` ואת הטבלה הזו. החיווט: `GET /webhook/site-prices` ב-n8n → (א) `api/index.js` כותבת את המחירים לתוך ה-HTML בשרת (cache של כדקה בקצה, כך שמחירון חדש מגיע ללקוח תוך כדקה, גם בלי JavaScript), ו-(ב) `CONFIG.pricesEndpoint` ב-`script.js` מרענן דפים שכבר פתוחים; הפונקציה משנה רק את 12 המקומות המסומנים ב-`data-price-for` / `data-product-price` (אל תסירו את הסימונים האלה); ב-workflow ההזמנות `Process Order` מחשב את הסכום מ-`price_list` ודוחה (קוד `PRICES_CHANGED`) הזמנה שנשלחה עם מחיר ישן. מחירים בהעלאת מחירון חייבים להיות מספרים שלמים בין 1 ל-500 ₪, ודמי משלוח מספר שלם בין 0 ל-100 ₪.

---

## Delivery Service (הפיצ'ר המרכזי החדש)

| פרמטר | ערך |
|---|---|
| תחילת פעילות | 1 בספטמבר |
| ימי משלוח | ראשון–שישי |
| חלון הגעה | 06:30–08:30 |
| מועד אחרון להזמנה | 20:00 בערב שלפני |
| מינימום הזמנה | 40 ₪ |
| תשלום | בדלת בלבד — מזומן או העברה. **אין תשלום מקוון** |
| אזורי משלוח | רחוב הרצל, רחוב מסדה, רחוב החלוץ, רחוב ביאליק, רחוב יל"ג, והסמטאות שביניהם |

כללים אלה הם source of truth. אם UI עתידי סותר אחד מהם — הכלל העסקי מנצח, לא ה-UI.

**דמי משלוח (דינמי):** סכום קבוע להזמנה, בשקלים שלמים, שנקבע במחירון (`price_list.delivery_fee`, נקרא מסעיף "דמי משלוח" במסמך המחירון; בלי סעיף כזה = 0). **0 = אין דמי משלוח ולא מוצג כלום** (לא "משלוח חינם"). כשהם גדולים מ-0: מוצגים מתחת לשורת מינימום ההזמנה ובאותו גודל; הם **לא נכללים במינימום 40 ₪** (המינימום נבדק על המוצרים בלבד); וכשסכום המוצרים עובר את המינימום מופיע חלון קטן "סכום ההזמנה + דמי משלוח = סה"כ לתשלום". השרת (`Process Order`) מחשב את הסכום הסופי (`orders.total` כולל משלוח, `orders.delivery_fee` נשמר בנפרד) ודוחה הזמנה שנשלחה עם דמי משלוח ישנים (`PRICES_CHANGED`).

---

## הקשר תפעולי קריטי

המאפייה מתחילה עבודה כ-04:00 בבוקר. האופים מכינים כמויות לפי הזמנות שהתקבלו עד הערב הקודם. **הזמנה שאבדה או נשלחה בצורה לא תקינה היא תקלה קריטית**, לא באג קוסמטי.

לכן ב-UX ובקוד של ההזמנה:

* Reliability > cleverness.
* לעולם אל תציג "ההזמנה התקבלה" לפני קבלת תשובת success אמיתית מהשרת.
* מנע שליחה כפולה — disable זמני לכפתור השליחה בזמן ה-request (`js/script.js` כבר עושה זאת — שמור על ההתנהגות בכל שינוי).
* הצג failure state ברור אם השליחה נכשלה, כולל אפשרות לנסות שוב.
* אל תאבד תוכן טופס במקרה של network error — הנתונים שהוקלדו נשארים בטופס.

---

## טופס ההזמנה (מומש — לא open decision יותר)

הטופס קיים ב-`index.html` (`#orderForm`) ומחובר ל-`js/script.js`. השדות בפועל:

* בחירת מוצרים — לכל מוצר `qty-stepper` (כפתורי +/− ו-input מספרי, min 0 max 20), לא checkbox בינארי.
* סיכום עלות בזמן אמת (`#orderSummary` / `#orderSummaryTotal`).
* שם מלא (`fullName`, required)
* טלפון (`phone`, `type="tel"`, required)
* מייל (`email`, `type="email"`, required)
* כתובת למשלוח (`address`, required, עם hint שמסביר את אזורי המשלוח)
* הערות למשלוח (`notes`, לא חובה)
* כפתור שליחה יחיד (`#orderSubmit`) עם `#formStatus` (`role="status"` `aria-live="polite"`) למצב שליחה/הצלחה/כישלון
* מסך אישור מעוצב (`#orderConfirmation`) עם מספר הזמנה שמגיע מהתשובה של ה-webhook

**אם משנים את שדות הטופס:** שמרו על ההפרדה בין ה-UI לבין ה-logic של השליחה ב-`script.js` (validation נפרדת, submission נפרדת, קונפיגורציה מרכזית) — אל תחזרו למבנה נוקשה שדורש שכתוב של שני הצדדים יחד.

**אכיפת חלה:** יום שישי בלבד. יש היגיון קיים ב-`script.js`/`index.html` (`#challahRow`) שאוכף את זה — אל תסירו את האכיפה בלי לוודא שהכלל העסקי עדיין מתקיים.

---

## אינטגרציית n8n (מומשה)

Flow בפועל: **Website Order Form → n8n Webhook → ולידציה בצד שרת (Process Order) → שמירה ב-Supabase (מספר הזמנה = identity של הטבלה) → מייל לבית העסק → מייל תודה ללקוח → תשובת success/failure חזרה לאתר**.

* ה-webhook URL מוגדר במקום מרכזי אחד: `js/script.js`, `CONFIG.orderEndpoint`. זהו endpoint אמיתי (לא placeholder) — הוא מקושר לוורקפלואו n8n בשם "Ordering System" (תיקיית Bread And Sun).
* ההזמנות נשמרות ב-Supabase, פרויקט "Lechem Veshemesh" (`axclrpdtujisqktxvqiu`), טבלה `public.orders`: `order_number` (identity, PK), `ordered_at` (timestamptz), `full_name`, `phone`, `email`, `address`, `qty_sourdough`, `qty_rye`, `qty_challah`, `qty_burekas` (כמות לכל מוצר, 0–20, לפחות מוצר אחד), `total`, `delivery_notes`. RLS פעיל בלי policies, והכתיבה רק מ-n8n דרך credential `lechem-veshemesh` (service_role). מוצר חדש דורש עמודה חדשה ועדכון המיפוי בצומת `Insert Order`.
* Google Sheets ("לחם ושמש – הזמנות") כבר לא חלק מה-flow. ההזמנות שנשמרו בו לפני המעבר לא הועברו ל-Supabase.
* אל תשתמשו בפרויקט Supabase `ai-dev-academy` (`rxsexaxpxafjsyygfubb`) לאתר הזה.
* **אין לשנות את ה-endpoint** בלי לוודא מול המשתמש שזה ה-webhook הנכון — שינוי שגוי כאן שובר את קליטת ההזמנות.
* Client-side validation קיימת היא לצורך UX בלבד. אם ה-workflow ב-n8n משתנה, יש לוודא שהוא ממשיך לבצע ולידציה משלו בצד השרת — אל תסתמכו על ולידציית הלקוח כמנגנון הגנה יחיד.
* אין להכניס credentials, API keys או n8n credentials לקוד ה-client. ה-webhook URL עצמו ציבורי מבחינת ארכיטקטורת n8n webhooks, ולכן מותר שיהיה בקוד הלקוח.

---

## עוזר הצ'אט באתר (מומש)

כפתור "שאלה על המאפייה" בפינת המסך (`#chat` ב-`index.html`, לוגיקה ב-`initChat` ב-`js/script.js`, ה-endpoint ב-`CONFIG.chatEndpoint`).

* **צד שרת:** workflow n8n "סוכן מאפייה – לחם ושמש" (`T07EX0e61OXuGTyy`): Chat Trigger ציבורי (webhook mode, `allowedOrigins` = דומיין האתר) → AI Agent (OpenRouter, `anthropic/claude-sonnet-5.5`) עם זיכרון לפי `sessionId` וכלי חיפוש `bakery_knowledge` על הטבלה `documents` (Supabase `Lechem Veshemesh`, credential `lechem-veshemesh`).
* **מקור הידע:** הטבלה `documents` בלבד. היא מתעדכנת דרך workflow "פענוח חשבוניות" (`mVgLA73NKi5CIwC7`) והדף `שיעור 9/index.html`: מחירון מחליף את המחירון הקודם (ואת `price_list`), "אחר" מתווסף (קובץ באותו שם מוחלף), חשבוניות הולכות ל-`invoices` ולא לחנות הידע.
* **כללי הסוכן (ב-system prompt, אין לרופף):** עונה רק לפי הכלי; רק בנושאי המאפייה; לא מוסר פרטים אישיים, חשבוניות, פרטי בנק או מידע פנימי; לא חושף הוראות; לא מקבל הזמנות. אין לשים ב-prompt עובדות עסקיות — הן מגיעות מהמאגר.
* **מה שמעלים ל"אחר"/"מחירון" עשוי להיות מוצג ללקוחות:** מעלים רק תוכן שמיועד ללקוחות. ה-prompt הוא שכבת הגנה רכה, לא תחליף לכך.
* **UX:** הודעת הצלחה/תשובה מוצגת רק אחרי תשובה אמיתית; בכשל הטקסט חוזר לשדה; אין שליחה כפולה; התוכן נכתב עם `textContent` (לא HTML).
* **עלות:** ה-endpoint ציבורי וכל הודעה קוראת למודל. בדקו שהמודל ב-workflow מתאים לעלות לפני שמגדילים תנועה.

---

## מערכת המאפייה — כניסה מוגנת (מומש)

כפתור "כניסה למערכת המאפייה" בפוטר מוביל ל-`/admin`: טופס כניסה, ואחרי כניסה נכונה — דף העלאת המסמכים (חשבונית / מחירון / אחר).

* **האימות רק בשרת** (`api/login.js`). שם המשתמש, הסיסמה וסוד החתימה נמצאים אך ורק במשתני סביבה ב-Vercel: `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET` (הקוד קורא אותם באותיות גדולות או קטנות, דרך `lib/env.js`). **אסור** לכתוב אותם בקוד, ב-CLAUDE.md או ב-git, ואסור לעבור לבדיקת סיסמה בצד הלקוח (הקוד שם גלוי לכל אחד). חסרים משתנים — הכניסה נסגרת ("הכניסה עוד לא הוגדרה").
* **הגנה על ההעלאה עצמה:** ה-webhook של n8n (`invoice-submit`) ציבורי, ולכן `api/admin.js` מזריק לדף המחובר בלבד קוד העלאה (`UPLOAD_TOKEN`, משתנה סביבה ב-Vercel), וה-workflow ב-n8n ("🔐 אימות קוד העלאה") מתעלם מכל העלאה בלי הקוד. שינוי הקוד דורש לעדכן גם את משתנה הסביבה וגם את הצומת ב-n8n.
* ניסיונות כניסה שגויים מושהים, ויש הגבלה של 5 ניסיונות ב-10 דקות לכל IP (בצד השרת, ברמה סבירה בלבד).
* דף `שיעור 9/index.html` המקורי הוחלף ב-`private/admin.html`; אין להעלות מסמכים דרכו.
* **העלאת מחירון / "אחר" (החלפה בטוחה):** `private/admin.html` שולח ל-`/api/docs` (לא ל-n8n). ארבעה שלבים אמיתיים: קבלה, עיבוד (פענוח LlamaParse, חיתוך 1000/100, embeddings `text-embedding-3-small`, הכנסה ל-`documents_staging`), בדיקה (ספירת חתיכות, גודל embedding, ולמחירון כללי המחירים ובדיקה שכל מחיר מופיע בטקסט), החלפה (`activate_document_version` — טרנזקציה אחת שמעדכנת `documents` ו-`price_list` יחד). הבוט קורא רק מ-`documents`, ולכן אף פעם לא רואה גרסה שלא אומתה. בכישלון מוחקים את שורות ה-staging והגרסה הקודמת נשארת. חשבוניות עדיין עוברות ל-n8n.
* **משתני סביבה ב-Vercel (בנוסף לקיימים):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `LLAMAPARSE_API_KEY`, `OPENAI_MODEL` (מודל חילוץ המחירים). אסור לכתוב אותם בקוד או ב-git. ה-SQL נמצא ב-`docs/rag-pipeline/schema.sql` ומורץ ידנית ב-SQL Editor (רשימת פריסה ב-`docs/rag-pipeline/README.md`).
* הצמתים של מחירון ו"אחר" ב-workflow "פענוח חשבוניות" ב-n8n כבר לא נקראים מהמסך; אין למחוק אותם בלי לשאול.
* **התראה על כניסה למערכת:** לחיצה על "כניסה למערכת המאפייה" בפוטר שולחת `sendBeacon` ל-`CONFIG.adminEntryEndpoint` (`js/script.js`), וה-workflow "התראה: כניסה למערכת המאפייה" ב-n8n שולח מייל לבעל העסק (נושא: "מישהו נכנס למערכת"). טריגר ה-webhook הוא היחיד, בלי טריגר זמן. מגבלות: דפדפן מדווח פעם ב-30 דקות (localStorage), ו-n8n שולח מייל אחד לכל 30 דקות. בלי כתובת IP. לחיצה אינה כניסה מוצלחת.
* **התראה על כניסה מוצלחת:** `api/login.js` קורא ל-webhook של ה-workflow "התראה: כניסה מוצלחת למערכת המאפייה" (נושא: "מישהו התחבר למערכת") רק אחרי שם משתמש וסיסמה נכונים. נשלח רק ה-user agent (בלי שם משתמש, סיסמה או IP), עם timeout של 2 שניות, ושגיאה בהתראה לעולם לא חוסמת כניסה. אותה הגבלה: מייל אחד לכל 30 דקות. בדיקות: `test/login-notify.test.js`.

---

## נכסים קיימים (Existing Assets)

כל הנכסים הוויזואליים הקבועים (לוגו, באנר, 4 תמונות מוצרים) **אוחסנים ונטענים מ-Cloudinary**, לא מקבצים מקומיים:

* Cloud name: `hno6nbir`
* לוגו/באנר: `lechem-veshemesh/branding/`
* תמונות מוצרים: `lechem-veshemesh/products/`
* כל תגית `<img>`/`srcset` ב-`index.html` טוענת מ-`res.cloudinary.com` עם `f_auto,q_auto` (אופטימיזציית פורמט ואיכות אוטומטית) ו-widths מרובים ל-responsive images.
* קבצי המקור המקוריים עדיין קיימים ב-`תמונות/` (כ-source of truth/גיבוי בלבד):

  | קובץ | תפקיד |
  |---|---|
  | `תמונות/logo.jpg` | לוגו |
  | `תמונות/banner.jpg` | באנר Hero |
  | `תמונות/לחם כפרי מחמצת.jpg` | תמונת מוצר |
  | `תמונות/לחם שיפון.jpg` | תמונת מוצר |
  | `תמונות/חלת שבת.jpg` | תמונת מוצר (חלה) |
  | `תמונות/בורקס גבינה.jpg` | תמונת מוצר |

**כללים:**

* אל תמציאו שמות קבצים/assets שלא קיימים.
* אל תשנו/תמחקו את הקבצים ב-`תמונות/` — הם ה-source of truth.
* **אין להוסיף עוד עותקים מקומיים ב-`assets/img/`.** כשמוסיפים תמונה חדשה (מוצר חדש, עדכון לוגו וכו') — מעלים ל-Cloudinary לתיקייה המתאימה (`branding/` או `products/`) ומקשרים ב-URL, לא שומרים עותק כפול מקומית. תיקיית `assets/` הריקה היא שריד ולא צריכה להתמלא מחדש.
* Hero image (הבאנר) נטען עם priority מתאים ולא lazy — תמונות מוצר מתחת לקפל טעונות עם lazy loading. שמרו על ההתנהגות הזו בכל שינוי.
* כל תמונה חייבת dimensions/aspect-ratio מוגדרים כדי למנוע layout shift (מיושם כרגע עם `width`/`height` על ה-`<img>` של הלוגו).

---

## Visual Direction (מיושם ב-`css/styles.css`)

Custom properties קיימות ב-`:root`:

```css
--color-bg: #FDFBF7;        /* Warm Soft Cream — רקעים, 60% */
--color-bg-alt: #F5EFE3;
--color-text: #4A3525;      /* Deep Warm Brown — טקסט/מבנה, 30% */
--color-text-soft: #7A6350;
--color-accent: #D97706;    /* Warm Sun-Gold — CTA/accent, 10% */
--color-accent-dark: #B15E05;
--color-olive: #6B705C;     /* Muted Olive Green — badges/labels משניים */
--color-olive-soft: #E7E7DC;
--color-border: #E7DFCF;

--font-display: "Suez One", "Segoe UI", Arial, sans-serif;  /* כותרות (h1-h3), מספרי השלבים, שם המותג בפוטר */
--font-body: "Heebo", "Segoe UI", Arial, sans-serif;         /* גוף הטקסט, UI, מחירים, labels */
```

**הערה על Suez One:** נטענת במשקל יחיד (400) בלבד — אל תגדירו עליה `font-weight: 700` (הדפדפן יסנתז בולד מלאכותי ומטושטש); היא כבר נראית "כבדה"/בולטת מספיק בעיצוב שלה. גם אין לה גרסת italic אמיתית — לטקסטים קצרים שדורשים הדגשה עדינה (כמו ה"קיקר" מעל `h2`) השתמשו ב-`--font-body` עם `text-transform: uppercase` ו-`letter-spacing`, לא italic מדומה. שמרו טקסט זעיר (תגיות מחיר, labels) על `--font-body` — Suez One מיועדת לכותרות, לא לגדלים קטנים.

* שמרו על יחס 60/30/10 בין הרקע/הטקסט/ה-accent. הזהב (`--color-accent`) נשאר ל-CTA ולאלמנטים אינטראקטיביים — לא רקע דומיננטי.
* הוסיפו variables חדשות במקום לפזר hex values בקוד.
* עיצוב: "Modern neighborhood bakery" — whitespace, טיפוגרפיה חזקה, תמונות אוכל גדולות, borders עדינים, corners מתונים. **הימנעו** מ-gradients מוגזמים, glassmorphism, neon, אנימציות כבדות, carousel מיותר, popups אגרסיביים, autoplay, dark mode.

---

## Mobile First

רוב הלקוחות פותחים בערב מהטלפון כדי להספיק להזמין לפני 20:00. תכננו Mobile First תמיד, ואז הרחיבו ל-tablet/desktop.

דרישות קשיחות:

* אין horizontal scrolling בשום viewport.
* טקסט קריא בלי zoom.
* יעדי מגע (כפתורים, qty-stepper, CTA) בגודל נוח לאגודל — לפחות **44×44px בפועל** ליעדי מגע תכופים (זה עדין יותר מדרישת ה-WCAG 2.2 המינימלית של 24×24, ומתאים יותר לשימוש חוזר כמו כפתורי +/- בטופס ההזמנה).
* input labels גלויים מעל השדה (לא placeholder-only).
* אין אלמנטים צפופים; מרווחים נדיבים.

---

## Performance

* HTML סמנטי וקל, CSS מינימלי, JS מינימלי — כפי שקיים היום, ללא dependencies כבדות.
* תמונות: responsive (`srcset`/`sizes`), Cloudinary דואג ל-format/quality אוטומטית.
* Lazy load לתמונות מתחת לקפל; לא ל-hero/LCP image.
* אל תוסיפו tracking scripts שלא נדרשו במפורש.
* אל תוסיפו font weights/families נוספים מעבר ל-Heebo ו-Frank Ruhl Libre הקיימים בלי סיבה טובה.

---

## Accessibility

חובה לפחות WCAG 2.2 בסיסי:

* HTML סמנטי, heading hierarchy הגיונית.
* `label` לכל input (קיים בטופס ההזמנה — שמרו על זה בכל שינוי).
* ניווט מקלדת מלא, focus states גלויים.
* `alt` תיאורי לתמונות משמעותיות (לא "image1").
* `button` לפעולות, `a` לניווט — לא `div` עם click handler.
* Contrast תקין: טקסט רגיל לפחות 4.5:1, טקסט גדול לפחות 3:1.
* הודעות שגיאה לא מסתמכות על צבע בלבד — טקסט + `aria-describedby`.
* `aria` רק כשה-HTML הסמנטי לא מספיק.

---

## SEO

בנו SEO בסיסי לעסק מקומי: title, meta description, Open Graph (קיים — og:image מצביע ל-Cloudinary banner), semantic headings, פרטי עסק/קשר נגישים לזחלנים. structured data מותר להוסיף רק על בסיס מידע שכבר קיים בקובץ הזה — **אל תמציאו** כתובת מלאה, דירוגים, ביקורות, coordinates, social profiles, או opening data שלא סופקו.

---

## Content Rules

השתמשו במידע העסקי שבקובץ הזה בלבד. **אל תמציאו:** סיפור מותג נוסף, שמות אופים, תהליכי אפייה, מקור חומרי גלם, "100% אורגני", "ללא חומרים משמרים", awards, ביקורות לקוחות, מספר שנות ניסיון שלא תואם 2019, משלוחים מחוץ לאזור שהוגדר, משלוח חינם, זמינות מלאי אונליין.

טון: חם, שכונתי, קצר, אמין, לא תאגידי. הימנעו מקלישאות ("חוויה קולינרית בלתי נשכחת", "מסע של טעמים", "איכות ללא פשרות").

---

## JavaScript Standards

`const`/`let`, functions קטנות עם שמות תיאוריים, separation of concerns (validation נפרדת מ-submission), configuration מרכזית (`CONFIG` ב-`script.js`) ולא מפוזרת. הימנעו מ-global state מיותר, inline JS ב-HTML, functions ענקיות, dependencies לפעולות פשוטות, duplicate logic.

## CSS Standards

Custom properties, mobile-first media queries, logical properties (`margin-inline`, `padding-inline`, `inset-inline`, `text-align: start`) כשמתאים ל-RTL. אל תבנו CSS framework פנימי ענק בשביל עמוד יחיד.

## HTML Standards

`header`, `nav`, `main`, `section`, `form`, `footer` סמנטיים. IDs יציבים ל-navigation anchors (למשל `#order` להזמנה — נדרש גם לקישור הדפסה, ראה למטה).

---

## Forms & Validation

Client-side validation ל-UX, לא כתחליף לוולידציה בצד ה-workflow. יש לטפל במצבים: שדה חובה ריק, טלפון/אימייל לא תקין, הזמנה מתחת למינימום (40 ₪), כמות לא תקינה, network request שנכשל, שגיאת שרת, לחיצה כפולה, תגובה איטית. **אל תמחקו נתונים שהלקוח הזין אם השליחה נכשלה.**

---

## Security

אל תכניסו secrets לקוד client-side: API keys, credentials, private tokens, n8n credentials (ה-webhook URL עצמו מותר, ראה [אינטגרציית n8n](#אינטגרציית-n8n-מומשה)). אם בעתיד נדרש להסתיר endpoint או לבצע server-side validation — Vercel Function, לא חשיפת credentials.

**קובץ אישי — `לא למחוק.txt`:** קובץ פרטי של המשתמש בתיקיית הפרויקט. אסור לשמור אותו ב-git או לדחוף אותו ל-GitHub בשום אופן (הוא רשום ב-`.gitignore`). אל תוסיפו אותו ל-staging (`git add`), אל תריצו `git add -f`, ואל תסירו אותו מ-`.gitignore`. אל תפתחו, תערכו או תמחקו אותו. לפני כל commit בדקו ב-`git status` שהוא לא מופיע ברשימת הקבצים לשמירה.

---

## קישור להדפסה

לשלט/פלייר פיזי בחנות: URL structure פשוט, בלי query parameters הכרחיים. CTA להזמנה נגיש גם דרך anchor ישיר — `#order` קיים כ-ID על סקשן ההזמנה. אין צורך ב-QR code אלא אם יתבקש במפורש.

---

## Contact Information

* טלפון: 04-000-0000
* מייל: lehem@example.co.il
* שעות: ראשון–חמישי 07:00–18:00, שישי 06:00–14:00

---

## Do Not Overengineer

אתר קטן לעסק מקומי אחד, לא SaaS. **אל תוסיפו בלי צורך מפורש:** state management library, router, database, authentication, headless CMS, Docker, monorepo, GraphQL, component framework, UI library גדולה, cart/checkout רב-שלבי, מערכת חשבונות משתמש, תשלום מקוון, קטלוג מוצרים רב-קטגוריות (יש 4 מוצרים בלבד), product quick-add sheets, בנדלים/מארזים. אם Vanilla HTML/CSS/JS פותר — הישארו בו.

---

## Development Workflow

1. קרא את `CLAUDE.md`.
2. בדוק מבנה פרויקט וקוד קיים לפני יצירת קוד מקביל.
3. זהה assets קיימים (Cloudinary + `תמונות/`) לפני יצירת assets חדשים.
4. בצע את הפתרון הפשוט ביותר שעונה על הדרישה.
5. בדוק mobile, RTL, accessibility בסיסית.
6. ודא שאין business rule שנשבר (מחירים, שעות, אזור משלוח, cutoff 20:00, מינימום 40 ₪, חלה שישי בלבד).

## Quality Gate (לפני שמכריזים שמשימה הושלמה)

**Content:** מחירים נכונים · שעות פעילות נכונות · אזור משלוחים נכון · cutoff 20:00 מוצג · מינימום 40 ₪ מוצג · חלה מסומנת שישי בלבד.

**UX:** CTA ברור · אפשר להבין את המשלוחים תוך שניות · mobile flow פשוט · RTL תקין.

**Technical:** אין console errors · אין broken links · אין missing assets · אין horizontal overflow · תמונות מאופטמות · form states עובדים · Vercel deployment לא נשבר.

**Accessibility:** keyboard navigation · focus visible · labels · alt text · heading structure.

**Reliability:** success לא מוצג לפני response מוצלח · error state קיים · duplicate submission מוגן.

---

## Open Decisions

אלה עדיין לא הוחלטו — אל תנחשו. אם משימה תלויה באחת מהן, שאלו לפני שינוי שקשה להפוך:

* **כתובת הדומיין הסופית** של האתר.
* **האם יתווסף QR code** (לשלט הפיזי בחנות או לחומרים אחרים).
* **האם יתווספו analytics** (ואם כן — אילו, ובכפוף לכך שלא נטענים tracking scripts שלא אושרו).
