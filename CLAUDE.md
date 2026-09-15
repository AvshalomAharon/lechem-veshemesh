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
css/styles.css       כל ה-CSS (custom properties, mobile-first)
js/script.js          כל ה-JS (config, validation, submission)
תמונות/               קבצי המקור המקוריים של כל הנכסים הוויזואליים (backup/source of truth)
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

* האתר פרוס ב-**Vercel**. כל שינוי חייב להישאר תואם לפריסה סטטית ב-Vercel.
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

Flow בפועל: **Website Order Form → n8n Webhook → תיוק ב-Google Sheets (מספר הזמנה רץ) → מייל לבית העסק → מייל תודה ללקוח → תשובת success/failure חזרה לאתר**.

* ה-webhook URL מוגדר במקום מרכזי אחד: `js/script.js`, `CONFIG.orderEndpoint`. זהו endpoint אמיתי (לא placeholder) — הוא מקושר לוורקפלואו n8n בשם "Ordering System" (תיקיית Bread And Sun).
* קובץ הגיליון: "לחם ושמש – הזמנות", לשונית "הזמנות", עמודות: מספר הזמנה, תאריך ושעה, שם מלא, טלפון, מייל, כתובת, מוצרים, הערות למשלוח. מעוצב RTL עם שורת כותרת קפואה ומודגשת.
* **אין לשנות את ה-endpoint** בלי לוודא מול המשתמש שזה ה-webhook הנכון — שינוי שגוי כאן שובר את קליטת ההזמנות.
* Client-side validation קיימת היא לצורך UX בלבד. אם ה-workflow ב-n8n משתנה, יש לוודא שהוא ממשיך לבצע ולידציה משלו בצד השרת — אל תסתמכו על ולידציית הלקוח כמנגנון הגנה יחיד.
* אין להכניס credentials, API keys או n8n credentials לקוד ה-client. ה-webhook URL עצמו ציבורי מבחינת ארכיטקטורת n8n webhooks, ולכן מותר שיהיה בקוד הלקוח.

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
