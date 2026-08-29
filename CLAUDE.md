צור עבור הפרויקט הנוכחי קובץ `CLAUDE.md` מפורט, ממוקד ו-production-ready, שישמש כהנחיות העבודה הקבועות של Claude Code בתוך VS Code.

לפני כתיבת הקובץ:

* סרוק את מבנה תיקיית הפרויקט.
* זהה קבצי תמונות קיימים, כולל תמונות מאפים, לוגו ובאנר.
* אל תמציא שמות קבצים או assets שלא קיימים.
* אל תשנה או תמחק assets מקוריים.
* אם יש כבר קוד בפרויקט, התחשב בו לפני קביעת מבנה הפרויקט.
* אם חסר מידע שאי אפשר להחליט עליו בצורה בטוחה, השאר אותו כ־open decision ב־`CLAUDE.md` במקום להמציא.

---

# מטרת הפרויקט

בניית אתר תדמית והזמנות חד-עמודי עבור מאפיית **"לחם ושמש"** בחיפה.

העסק הוא מאפייה קטנה בשכונת הדר בחיפה, פעילה משנת 2019.

המאפייה אופה:

* לחמי מחמצת
* לחמים
* חלות
* מאפים

כל המוצרים נאפים באותו הבוקר.

המטרה המרכזית של האתר היא להשיק שירות משלוחים שכונתי חדש ולאפשר ללקוחות להבין במהירות:

1. מה אפשר להזמין.
2. לאן מתבצעים משלוחים.
3. מתי מזמינים.
4. מתי המשלוח מגיע.
5. כמה זה עולה.
6. איך משאירים הזמנה.

האתר צריך להיות פשוט, מהיר מאוד, אמין ומותאם בראש ובראשונה למובייל.

---

# Stack

ברירת המחדל של הפרויקט:

* HTML5
* CSS3
* Vanilla JavaScript

העדף פתרון סטטי, פשוט וקל לתחזוקה.

מותר להשתמש בטכנולוגיות, ספריות או Stack נוסף רק כאשר יש לכך יתרון ממשי וברור.

אין להוסיף Framework רק משום שהוא זמין.

במיוחד:

* אל תעביר את הפרויקט אוטומטית ל־React / Next.js.
* אל תוסיף build system מורכב ללא צורך.
* אל תוסיף dependency שאפשר להימנע ממנה בקלות.

אם נדרש קוד צד שרת קטן לצורך אינטגרציה, אפשר להשתמש ב־Vercel Functions / Serverless Functions.

---

# Deployment

האתר מיועד לפריסה ב־Vercel.

כל שינוי צריך להישאר compatible עם Vercel.

העדף deployment פשוט ככל האפשר.

אין צורך כרגע:

* database
* authentication
* מערכת משתמשים
* payment gateway
* CMS
* inventory system

---

# Language & Direction

האתר הוא:

* בעברית בלבד.
* `lang="he"`
* RTL מלא.
* `dir="rtl"`

כל רכיב חייב להיות מתוכנן מראש ל־RTL, כולל:

* navigation
* cards
* buttons
* forms
* validation messages
* icons
* spacing
* alignment
* mobile layouts

אין ליצור גרסה באנגלית.

אין להוסיף language switcher.

---

# Business Information

שם העסק:

לחם ושמש

מיקום:

שכונת הדר, חיפה.

פעילות מאז:

2019.

מסר מרכזי:

מאפייה שכונתית שאופה בבוקר ומביאה לחם ומאפים טריים לתושבי השכונה בשעות הבוקר.

---

# Products

המוצרים והמחירים הנוכחיים:

1. לחם כפרי מחמצת

   * מחיר: 32 ₪

2. לחם שיפון

   * מחיר: 36 ₪

3. חלה

   * מחיר: 28 ₪
   * זמינה בימי שישי בלבד

4. בורקס גבינה

   * מחיר: 12 ₪ ליחידה

אל תשנה מחירים.

אל תמציא מוצרים נוספים.

אל תמציא וריאציות, גדלים, תוספות או מבצעים שלא הוגדרו.

---

# Delivery Service

זהו החלק החדש והחשוב ביותר באתר.

תחילת המשלוחים:

1 בספטמבר.

ימי פעילות:

ראשון עד שישי.

שעות הגעה:

07:00–09:00.

אזורי משלוח:

* רחוב הרצל
* רחוב מסדה
* רחוב החלוץ
* רחוב ביאליק
* הסמטאות שביניהם

מועד אחרון להזמנה:

20:00 בערב שלפני המשלוח.

מינימום להזמנה:

40 ₪.

תשלום:

בדלת בלבד.

אפשרויות תשלום:

* מזומן
* העברה

אין תשלום מקוון באתר.

---

# Important Operational Context

המאפייה מתחילה את העבודה בסביבות 04:00 בבוקר.

האופים מכינים את הכמויות לפי ההזמנות שהתקבלו עד הערב שלפני.

מכאן שהזמנה שאבדה או לא נשלחה בצורה תקינה היא תקלה קריטית.

כאשר מפתחים את מערכת ההזמנות:

Reliability > cleverness.

יש לתכנן את ה־UX כך שללקוח יהיה ברור אם ההזמנה:

* נשלחת
* נשלחה בהצלחה
* נכשלה

לעולם אל תציג הודעת "ההזמנה התקבלה" לפני שהתקבלה תשובת success אמיתית מהמערכת שאליה הטופס נשלח.

מנע שליחה כפולה באמצעות disable זמני של כפתור השליחה בזמן request.

הצג failure state ברור אם השליחה נכשלה.

אל תאבד את תוכן הטופס במקרה של network error.

---

# Order Form

צריך להיות באתר טופס הזמנה מרכזי.

השדות המדויקים של הטופס עדיין לא הוחלטו.

לכן:

* אל תקבע באופן קשיח schema מורכב לפני שהדרישות מוגדרות.
* שמור את מבנה הטופס modular וקל לשינוי.
* הפרד בין UI של הטופס לבין logic של השליחה.
* אל תחבר כרגע שירות צד שלישי אקראי כדי "לסגור את הפינה".

המערכת העתידית תהיה מבוססת על webhook של n8n.

ה־flow העתידי יהיה בקירוב:

Website Order Form
→ n8n Webhook
→ validation / processing
→ Email
→ Google Sheets

לכן יש לתכנן את JavaScript כך שניתן יהיה בעתיד להגדיר endpoint אחד של webhook בלי לשכתב את ממשק הטופס.

לדוגמה, שמור endpoint במקום מרכזי/configurable ולא מפוזר בקוד.

אל תמציא webhook URL.

כאשר אין URL אמיתי, השתמש ב-placeholder ברור והסבר ב־README או בהערת קוד היכן להכניס אותו.

---

# Contact Information

טלפון:

04-000-0000

אימייל:

[lehem@example.co.il](mailto:lehem@example.co.il)

שעות החנות:

ראשון–חמישי:
07:00–18:00

שישי:
06:00–14:00

---

# Page Architecture

האתר צריך להיות Single Page Website.

תכנן היררכיית תוכן קצרה וברורה.

מבנה מומלץ:

1. Header / Navigation
2. Hero
3. הסבר קצר על המאפייה
4. המוצרים
5. אזור בולט המסביר את שירות המשלוחים החדש
6. איך מזמינים
7. טופס הזמנה
8. שעות ופרטי קשר
9. Footer

אפשר לשנות את הסדר אם במהלך המימוש מתגלה UX טוב יותר, אבל שמור את מטרת ההמרה המרכזית:

הגעה מהירה להזמנה.

---

# Hero

ה־Hero צריך להסביר בתוך שניות:

* מי זו לחם ושמש.
* שמדובר במאפייה שכונתית בהדר.
* שהלחם והמאפים נאפים בבוקר.
* שעכשיו קיימים משלוחי בוקר בשכונה.

צריך להיות CTA ברור שמוביל להזמנה.

הימנע מטקסט שיווקי גנרי ומוגזם.

הטון צריך להרגיש:

* מקומי
* אנושי
* חם
* פשוט
* אמין
* לא תאגידי

---

# Existing Assets

בתיקיית הפרויקט כבר קיימים:

* תמונות של המאפים.
* לוגו.
* באנר.

לפני יצירת ה־UI, אתר את הקבצים בפועל.

השתמש בנכסים הקיימים ולא ב־placeholders כאשר הם מתאימים.

אל תייצר לוגו חדש אם קיים לוגו בפרויקט.

אל תייצר תמונת Hero חדשה אם קיים באנר מתאים.

אל תשתמש ב־stock photos חיצוניות ללא צורך.

בדוק לכל asset:

* dimensions
* file size
* aspect ratio
* format
* suitability for mobile

אם התמונות כבדות:

* בצע אופטימיזציה non-destructive.
* שמור את המקור.
* ניתן ליצור גרסאות WebP / AVIF מותאמות Web.
* השתמש ב־responsive images כאשר הדבר מועיל.

מנע layout shift על ידי הגדרת dimensions/aspect-ratio.

השתמש ב־lazy loading לתמונות שאינן above-the-fold.

Hero asset מרכזי יכול להיטען ב־priority מתאים.

---

# Visual Direction

פלטת הצבעים מחייבת.

## Primary Background — 60%

Warm Soft Cream

`#FDFBF7`

שימושים:

* page backgrounds
* sections
* cards
* UI containers

## Text & Structure — 30%

Deep Warm Brown

`#4A3525`

שימושים:

* body text
* headings
* navigation
* structural UI
* footer

## CTA / Accent — 10%

Warm Sun-Gold

`#D97706`

שימושים:

* CTA buttons
* interactive states
* order actions
* cart/order icons
* important highlights

## Secondary Highlight

Muted Olive Green

`#6B705C`

שימושים:

* badges
* labels
* category indicators
* secondary highlights

---

# Color Usage

שמור בקירוב על יחס 60/30/10.

אל תהפוך את הזהב לצבע רקע דומיננטי.

CTA ראשי צריך להיות בולט באופן ברור.

ודא contrast נגיש.

השתמש ב־CSS custom properties, לדוגמה:

```css
:root {
  --color-bg: #FDFBF7;
  --color-text: #4A3525;
  --color-accent: #D97706;
  --color-olive: #6B705C;
}
```

הרחב את variables לפי הצורך במקום לפזר hex values ברחבי הקוד.

---

# Design Style

הכיוון העיצובי:

Modern neighborhood bakery.

האתר צריך להרגיש כמו מאפייה מקומית אמיתית, לא כמו template של SaaS או ecommerce ענק.

העדף:

* whitespace
* typography חזקה
* תמונות אוכל גדולות ואיכותיות
* hierarchy ברורה
* borders עדינים
* corners מתונים
* micro-interactions עדינות
* מרקמים/אלמנטים דקורטיביים רק אם אינם פוגעים בביצועים

הימנע:

* gradients מוגזמים
* glassmorphism
* neon
* UI טכנולוגי
* אנימציות כבדות
* carousel מיותר
* popup אגרסיבי
* autoplay
* dark mode אם לא התבקש
* אפקטים שמקשים על קריאה

---

# Mobile First

Mobile הוא ה־priority הראשון.

הנחת עבודה:

חלק גדול מהלקוחות יפתחו את האתר בערב דרך הטלפון וירצו להזמין במהירות.

תכנן Mobile First ולא Desktop First.

בדוק במיוחד viewport widths קטנים.

דרישות:

* CTA נוח לאגודל.
* אין horizontal scrolling.
* טקסט קריא ללא zoom.
* inputs בגודל נוח.
* מרווחים טובים.
* אין אלמנטים צפופים.
* product selection צריך להיות קל.
* navigation פשוט.

לאחר מכן הרחב ל־tablet ו־desktop.

---

# Performance

Performance הוא requirement מרכזי.

שאף ל־Core Web Vitals טובים.

בפרט:

* HTML semantic וקל.
* CSS מינימלי.
* JavaScript מינימלי.
* אין dependencies כבדות ללא צורך.
* optimize images.
* defer scripts כאשר מתאים.
* lazy load תוכן שאינו קריטי.
* אין fonts רבים או weights מיותרים.
* אל תטען tracking scripts שלא נדרשו.

האתר צריך להרגיש מהיר גם בחיבור סלולרי בינוני.

---

# Accessibility

שמור לפחות על עקרונות WCAG בסיסיים.

חובה:

* semantic HTML
* logical heading hierarchy
* labels לכל input
* keyboard navigation
* visible focus states
* alt text לתמונות משמעותיות
* buttons כ־button ולא div
* links כ־anchor
* contrast תקין
* error messages שאינם מסתמכים רק על צבע
* `aria` רק כאשר semantic HTML אינו מספיק

---

# SEO

בנה SEO בסיסי תקין לעסק מקומי.

כלול:

* title
* meta description
* canonical-ready structure
* Open Graph בסיסי
* semantic headings
* business/contact information בצורה נגישה למנועי חיפוש

ניתן להוסיף structured data מתאים לעסק מקומי אם אפשר לעשות זאת על סמך המידע הקיים בלבד.

אל תמציא:

* כתובת מלאה
* דירוגים
* ביקורות
* coordinates
* social profiles
* opening data שלא סופק

---

# Link for Print

אחד הצרכים העסקיים הוא ליצור קישור שניתן יהיה להדפיס ולתלות בחנות.

לכן:

* שמור URL structure פשוט.
* אין צורך במסלולים מורכבים.
* אין query parameters כחלק הכרחי מהשימוש באתר.
* CTA להזמנה צריך להיות נגיש גם דרך anchor ישיר במידת הצורך, לדוגמה `#order`.

אין צורך כרגע ליצור QR code אלא אם מתבקשים במפורש.

---

# Content Rules

השתמש במידע העסקי שסופק בלבד.

אל תמציא:

* סיפור מותג נוסף
* שמות אופים
* תהליכי אפייה שלא נמסרו
* מקור חומרי גלם
* "100% אורגני"
* "ללא חומרים משמרים"
* Awards
* ביקורות לקוחות
* מספר שנות ניסיון שאינו תואם ל־2019
* משלוחים מחוץ לאזור שהוגדר
* משלוח חינם
* זמינות מלאי

הטון:

חם, שכונתי, קצר וברור.

הימנע מקלישאות כמו:

* "חוויה קולינרית בלתי נשכחת"
* "מסע של טעמים"
* "איכות ללא פשרות"

עדיף ניסוח פשוט ואמין.

---

# Business Rules

יש להתייחס לכללים הבאים כ־source of truth:

* משלוחים מתחילים ב־1 בספטמבר.
* משלוחים ראשון–שישי.
* חלון הגעה 07:00–09:00.
* הזמנה עד 20:00 ביום שלפני.
* מינימום 40 ₪.
* תשלום בדלת בלבד.
* מזומן או העברה.
* חלה זמינה רק ביום שישי.
* אין תשלום אונליין.
* אין inventory online.

אם UI עתידי סותר אחד מהכללים האלה, הכללים העסקיים מנצחים.

---

# JavaScript Standards

כתוב JavaScript פשוט, קריא ותחזוקתי.

העדף:

* `const` / `let`
* small functions
* descriptive names
* event listeners מסודרים
* separation of concerns
* validation functions נפרדות
* submission function נפרדת
* centralized configuration

הימנע:

* global state מיותר
* inline JavaScript ב־HTML
* giant functions
* dependencies בשביל פעולות פשוטות
* duplicate logic

---

# CSS Standards

העדף:

* CSS custom properties
* mobile-first media queries
* logical properties שמתאימים RTL כאשר אפשר:

  * `margin-inline`
  * `padding-inline`
  * `inset-inline`
  * `text-align: start`
* naming עקבי
* reusable utility/component classes בצורה מתונה

אל תבנה framework CSS פנימי ענק בשביל עמוד יחיד.

---

# HTML Standards

השתמש ב־semantic HTML:

* `header`
* `nav`
* `main`
* `section`
* `article` כאשר מתאים
* `form`
* `footer`

השתמש ב־IDs יציבים עבור navigation anchors.

---

# Forms & Validation

כאשר הטופס יוגדר:

בצע client-side validation לצורך UX, אך אל תניח שזו validation מספיקה בצד המערכת.

כאשר n8n יתחבר, יש לבצע validation גם ב־workflow.

יש לטפל במצבים:

* empty required field
* invalid phone/contact field
* order below minimum
* invalid quantity
* failed network request
* server error
* duplicate click
* slow response

אל תמחק את הנתונים שהלקוח הזין אם השליחה נכשלה.

---

# Security

אל תכניס secrets ל־frontend.

לעולם אל תכניס לקוד client-side:

* API keys
* credentials
* private tokens
* n8n credentials

Webhook URL ציבורי, אם יהיה צורך בו, צריך להיות מוגדר בצורה ברורה ומתאימה לארכיטקטורה.

אם נדרש להסתיר endpoint או לבצע server-side validation, השתמש ב־Vercel Function במקום לחשוף credentials.

---

# Development Workflow

לפני שינוי משמעותי:

1. קרא את `CLAUDE.md`.
2. בדוק את מבנה הפרויקט.
3. בדוק קוד קיים לפני יצירת קוד מקביל.
4. זהה assets קיימים לפני יצירת assets חדשים.
5. בצע את הפתרון הפשוט ביותר שעונה על הדרישה.
6. בדוק mobile.
7. בדוק RTL.
8. בדוק accessibility בסיסית.
9. בדוק שאין business rule שנשבר.

---

# Do Not Overengineer

זהו אתר קטן לעסק מקומי.

מורכבות היא עלות.

אין ליצור architecture של מוצר SaaS עבור landing page אחד.

אל תוסיף ללא צורך:

* state management library
* router
* database
* authentication
* headless CMS
* Docker
* monorepo
* GraphQL
* component framework
* large UI library

אם Vanilla HTML/CSS/JS פותר את הבעיה היטב, הישאר בו.

---

# Quality Gate

לפני הכרזה שמשימה הושלמה, בדוק:

## Content

* כל המחירים נכונים.
* שעות הפעילות נכונות.
* אזור המשלוחים נכון.
* cutoff של 20:00 מוצג נכון.
* מינימום 40 ₪ מוצג נכון.
* החלה מסומנת כשישי בלבד.

## UX

* CTA ברור.
* אפשר להבין את המשלוחים תוך מספר שניות.
* Mobile flow פשוט.
* RTL תקין.

## Technical

* אין console errors.
* אין broken links.
* אין missing assets.
* אין horizontal overflow.
* images optimized.
* form states עובדים.
* Vercel deployment לא נשבר.

## Accessibility

* keyboard navigation.
* focus visible.
* labels.
* alt text.
* heading structure.

## Reliability

* success לא מוצג לפני response מוצלח.
* error state קיים.
* duplicate submission מוגן.

---

# Current Open Decisions

אל תנחש החלטות שטרם התקבלו.

כרגע פתוח:

* השדות המדויקים בטופס ההזמנה.
* ה־n8n webhook URL.
* מבנה הנתונים המדויק שיישלח ל־n8n.
* כתובת הדומיין הסופית.
* האם בעתיד יהיה QR code.
* האם יתווספו analytics.

כאשר משימה תלויה בהחלטה כזו, שאל לפני ביצוע שינוי שקשה להפוך.

---

# Priority Order

כאשר יש tradeoff, סדר העדיפויות הוא:

1. אמינות ההזמנה
2. Mobile UX
3. מהירות טעינה
4. בהירות המידע
5. Accessibility
6. תחזוקתיות
7. polish ויזואלי
8. features נוספים

---

# Final Instruction

כתוב עכשיו את `CLAUDE.md` עצמו בתוך root הפרויקט.

הקובץ צריך להיות תמציתי מספיק כדי ש-Claude Code יוכל להשתמש בו שוב ושוב, אך מפורט מספיק כדי למנוע drift בהחלטות לאורך פיתוח האתר.

אל תיצור את האתר בשלב הזה אלא אם התבקש במפורש.

לאחר יצירת `CLAUDE.md`, הצג:

1. את הנתיב שבו נוצר הקובץ.
2. תקציר קצר של 5–8 ההחלטות המרכזיות שהוגדרו בו.
3. רשימת open decisions בלבד.
