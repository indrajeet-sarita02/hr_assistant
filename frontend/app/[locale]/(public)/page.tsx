import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  CheckCircle2,
  Clock3,
  FileCheck2,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  formatCurrency,
  formatDate,
  formatNumber,
  shortReference,
} from "@/lib/format";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import { serverGetPage, withQuery } from "@/lib/server-api";
import type { CareerContent, Course, MockTest } from "@/lib/types";

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale = normalizeLocale(params.locale);
  return {
    title:
      locale === "hi"
        ? "करियर मार्गदर्शन और अभ्यास"
        : "Career guidance and practice",
    description:
      locale === "hi"
        ? "स्रोत-जाँचित करियर गाइड, वेतन संदर्भ, परीक्षा योजना और मॉक टेस्ट।"
        : "Source-checked career guides, salary context, exam planning and practice tests.",
    alternates: { canonical: `/${locale}` },
  };
}

function typeLabel(locale: Locale, item: CareerContent): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      article: "Guide",
      job: "Role guide",
      salary: "Salary guide",
      exam: "Exam guide",
    },
    hi: {
      article: "गाइड",
      job: "भूमिका गाइड",
      salary: "वेतन गाइड",
      exam: "परीक्षा गाइड",
    },
  };
  return labels[locale][item.content_type] || labels[locale].article;
}

function contentHref(locale: Locale, item: CareerContent): string {
  if (item.content_type === "exam") return `/${locale}/exams/${item.id}`;
  return `/${locale}/jobs/${item.id}`;
}

export default async function CareerHomePage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = normalizeLocale(params.locale);
  const [contentLocal, coursesLocal, testsLocal] = await Promise.all([
    serverGetPage<CareerContent>(
      withQuery("/career/content", { locale, limit: 6 }),
    ),
    serverGetPage<Course>(withQuery("/courses", { locale, limit: 3 })),
    serverGetPage<MockTest>(withQuery("/mock-tests", { locale, limit: 3 })),
  ]);

  const needsFallback = locale === "hi" && contentLocal.total === 0;
  const [content, courses, tests] = needsFallback
    ? await Promise.all([
        serverGetPage<CareerContent>(
          withQuery("/career/content", { locale: "en", limit: 6 }),
        ),
        coursesLocal.total
          ? Promise.resolve(coursesLocal)
          : serverGetPage<Course>(withQuery("/courses", { locale: "en", limit: 3 })),
        testsLocal.total
          ? Promise.resolve(testsLocal)
          : serverGetPage<MockTest>(withQuery("/mock-tests", { locale: "en", limit: 3 })),
      ])
    : [contentLocal, coursesLocal, testsLocal];

  const featured = content.items[0];
  const guides = content.items.filter((item) => item.content_type !== "salary").slice(0, 3);
  const salary = content.items.find((item) => item.content_type === "salary");
  const usingFallback =
    needsFallback && (content.total > 0 || courses.total > 0 || tests.total > 0);

  return (
    <>
      <section className="public-hero">
        <div className="public-container">
          <div className="hero-grid">
            <div>
              <span className="eyebrow">
                <Sparkles size={13} aria-hidden="true" />
                {locale === "hi" ? "स्पष्ट जानकारी, बेहतर करियर निर्णय" : "Career guidance, without the noise"}
              </span>
              <h1 className="hero-title">
                {locale === "hi" ? (
                  <>
                    अपने अगले करियर कदम के लिए{" "}
                    <em>स्पष्ट जानकारी</em> पाएँ।
                  </>
                ) : (
                  <>
                    Make your next career move with{" "}
                    <em>clearer information.</em>
                  </>
                )}
              </h1>
              <p className="hero-body">
                {locale === "hi"
                  ? "स्रोत-जाँचित करियर गाइड, वेतन संदर्भ, परीक्षा योजना और मॉक टेस्ट देखें। हर अनुमान स्पष्ट रूप से चिह्नित है, और कोई भी सामग्री आधिकारिक मार्गदर्शन का विकल्प नहीं है।"
                  : "Explore source-checked career guides, salary context, exam planning and practice tests. Every estimate is labelled, and nothing replaces official guidance."}
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary btn-lg" href={`/${locale}/jobs`}>
                  {locale === "hi" ? "करियर गाइड देखें" : "Explore career guides"}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link className="btn btn-secondary btn-lg" href={`/${locale}/mock-tests`}>
                  {locale === "hi" ? "मॉक टेस्ट देखें" : "Browse mock tests"}
                </Link>
              </div>
              <div className="hero-trust">
                <span className="hero-trust-item">
                  <ShieldCheck size={15} aria-hidden="true" />
                  {locale === "hi" ? "स्रोत और समीक्षा तिथि दिखाई जाती है" : "Source and review date shown"}
                </span>
                <span className="hero-trust-item">
                  <BadgeCheck size={15} aria-hidden="true" />
                  {locale === "hi" ? "कोई छिपा हुआ वेतन अनुमान नहीं" : "No hidden salary estimates"}
                </span>
                <span className="hero-trust-item">
                  <FileCheck2 size={15} aria-hidden="true" />
                  {locale === "hi" ? "आधिकारिक स्रोत से पुष्टि करें" : "Verify official requirements"}
                </span>
              </div>
            </div>

            <div className="hero-collage" aria-label={locale === "hi" ? "करियर संसाधन सारांश" : "Career resource summary"}>
              <article className="hero-card-main">
                <span className="hero-card-tag">
                  <Sparkles size={10} aria-hidden="true" />
                  {featured ? typeLabel(locale, featured) : "HR Assist"}
                </span>
                <h2 style={{ marginTop: 12 }}>
                  {featured
                    ? featured.title
                    : locale === "hi"
                      ? "करियर सामग्री तैयार की जा रही है"
                      : "Career content is being prepared"}
                </h2>
                <p>
                  {featured?.summary ||
                    (locale === "hi"
                      ? "संपादकीय समीक्षा पूरी होते ही स्रोत-जाँचित सामग्री यहाँ दिखेगी।"
                      : "Source-checked content will appear here once editorial review is complete.")}
                </p>
                <div className="hero-card-bars">
                  {[
                    { label: locale === "hi" ? "जाँच तिथि" : "Checked", value: featured?.source_checked_at, icon: BadgeCheck },
                    { label: locale === "hi" ? "स्रोत" : "Source", value: featured?.source, icon: BookOpen },
                    { label: locale === "hi" ? "भूगोल" : "Geography", value: featured?.geography, icon: BriefcaseBusiness },
                  ].map((item) => (
                    <div className="hero-bar-row" key={item.label}>
                      <item.icon size={11} aria-hidden="true" />
                      <span>{item.label}</span>
                      <span className="hero-bar-track">
                        <span className="hero-bar-fill" style={{ width: item.value ? "78%" : "32%" }} />
                      </span>
                      <span>{item.value ? String(item.value).slice(0, 20) : "—"}</span>
                    </div>
                  ))}
                </div>
              </article>
              <div className="hero-card-float">
                <span className="avatar avatar-coral">HR</span>
                <div className="hero-float-title">
                  {locale === "hi" ? "मानवीय निर्णय, स्पष्ट जानकारी" : "Human decisions, clear information"}
                </div>
                <div className="hero-float-copy">
                  {locale === "hi"
                    ? "AI मार्गदर्शन सलाहकार है; रोज़गार निर्णय अधिकृत लोग लेते हैं।"
                    : "AI guidance is advisory. Employment decisions stay with authorised people."}
                </div>
              </div>
              <div className="hero-card-mini">
                <span className="hero-mini-stat">{formatNumber(content.total, locale)}</span>
                <span className="hero-mini-copy">
                  {locale === "hi" ? "स्रोत-जाँचित करियर सामग्री" : "source-checked career resources"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {usingFallback && (
        <div className="public-container">
          <div className="alert alert-info">
            <BookOpen size={17} aria-hidden="true" />
            <div>
              <strong>{locale === "hi" ? "हिन्दी सामग्री समीक्षा में है" : "Hindi content is in review"}</strong>
              {locale === "hi"
                ? "अभी अंग्रेज़ी स्रोत सामग्री दिखाई जा रही है।"
                : "Showing English source content for now."}
            </div>
          </div>
        </div>
      )}

      <section className="public-section">
        <div className="public-container">
          <div className="feature-strip">
            <div className="feature-cell">
              <span className="feature-icon">
                <ShieldCheck size={18} aria-hidden="true" />
              </span>
              <h3>{locale === "hi" ? "स्रोत-जाँचित" : "Source-checked"}</h3>
              <p>
                {locale === "hi"
                  ? "हर गाइड के साथ स्रोत और अंतिम समीक्षा तिथि दिखाई जाती है।"
                  : "Every guide shows its source and last editorial review date."}
              </p>
            </div>
            <div className="feature-cell">
              <span className="feature-icon feature-icon-coral">
                <Calculator size={18} aria-hidden="true" />
              </span>
              <h3>{locale === "hi" ? "पारदर्शी वेतन संदर्भ" : "Transparent salary context"}</h3>
              <p>
                {locale === "hi"
                  ? "वेतन सीमा संकेतात्मक है, अनुमान के रूप में स्पष्ट रूप से चिह्नित।"
                  : "Salary ranges are labelled as estimates, not promises of pay."}
              </p>
            </div>
            <div className="feature-cell">
              <span className="feature-icon feature-icon-gold">
                <GraduationCap size={18} aria-hidden="true" />
              </span>
              <h3>{locale === "hi" ? "अभ्यास और योजना" : "Practice and planning"}</h3>
              <p>
                {locale === "hi"
                  ? "परीक्षा योजना और समयबद्ध मॉक टेस्ट से आत्मविश्वास बनाएँ।"
                  : "Build confidence with exam planning and timed mock tests."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section" id="career-guides">
        <div className="public-container">
          <div className="section-head">
            <div>
              <h2>{locale === "hi" ? "करियर गाइड" : "Career guides"}</h2>
              <p>
                {locale === "hi"
                  ? "नौकरी खोज, वेतन बातचीत और परीक्षा योजना के लिए व्यावहारिक मार्गदर्शन।"
                  : "Practical guidance for job searches, salary conversations and exam planning."}
              </p>
            </div>
            <Link className="section-head-link" href={`/${locale}/jobs`}>
              {locale === "hi" ? "सभी गाइड" : "All career content"}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {guides.length ? (
            <div className="guide-grid">
              {guides.map((item) => (
                <Link
                  className="guide-card"
                  href={contentHref(locale, item)}
                  key={item.id}
                >
                  <div className="guide-card-top">
                    <span className="guide-card-type">{typeLabel(locale, item)}</span>
                    <span className="badge badge-neutral">
                      <BadgeCheck size={11} aria-hidden="true" />
                      {locale === "hi" ? "जाँचित" : "Checked"}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <div className="guide-card-footer">
                    <span>
                      {item.source_checked_at
                        ? formatDate(item.source_checked_at, locale)
                        : locale === "hi"
                          ? "समीक्षा लंबित"
                          : "Review pending"}
                    </span>
                    <ArrowUpRight className="guide-card-arrow" size={15} aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card card-pad">
              <h3 className="section-title">{locale === "hi" ? "सामग्री तैयार की जा रही है" : "Career content is being prepared"}</h3>
              <p className="section-copy mt-2">
                {locale === "hi"
                  ? "संपादकीय समीक्षा पूरी होते ही स्रोत-जाँचित गाइड यहाँ दिखेंगी।"
                  : "Source-checked career guides will appear here once editorial review is complete."}
              </p>
            </div>
          )}
        </div>
      </section>

      {salary && (
        <section className="public-section">
          <div className="public-container">
            <div className="card card-pad">
              <div className="split">
                <div>
                  <div className="eyebrow">
                    <Calculator size={13} aria-hidden="true" />
                    {locale === "hi" ? "वेतन संदर्भ" : "Salary context"}
                  </div>
                  <h2 className="section-title" style={{ fontSize: 25 }}>
                    {salary.title}
                  </h2>
                  <p className="section-copy mt-2">{salary.summary}</p>
                  <div className="cluster mt-3">
                    <span className="badge badge-info">
                      {salary.salary_is_estimate
                        ? locale === "hi"
                          ? "अनुमान"
                          : "Estimate"
                        : locale === "hi"
                          ? "रिपोर्ट किया गया"
                          : "Reported"}
                    </span>
                    <span className="badge badge-neutral">{salary.geography}</span>
                    <span className="badge badge-neutral">{salary.currency}</span>
                  </div>
                </div>
                <div className="salary-band">
                  <div className="salary-band-label">
                    {locale === "hi" ? "संकेतात्मक सीमा" : "Indicative range"}
                  </div>
                  <div className="salary-band-value">
                    {formatCurrency(salary.salary_min, locale, salary.currency || "INR")}
                    <span> – </span>
                    {formatCurrency(salary.salary_max, locale, salary.currency || "INR")}
                  </div>
                  <p className="tiny muted mt-2">
                    {locale === "hi"
                      ? "यह वेतन की गारंटी नहीं है। स्थान, अनुभव और नियोक्ता के अनुसार राशि बदलती है।"
                      : "This is not a guarantee of pay. Ranges vary by location, experience and employer."}
                  </p>
                  <Link className="btn btn-secondary btn-sm mt-3" href={contentHref(locale, salary)}>
                    {locale === "hi" ? "वेतन गाइड पढ़ें" : "Read salary guide"}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="public-section">
        <div className="public-container">
          <div className="grid grid-2">
            <div>
              <div className="section-head">
                <div>
                  <h2>{locale === "hi" ? "कौशल बढ़ाने के कोर्स" : "Courses to build your next skill"}</h2>
                  <p>
                    {locale === "hi"
                      ? "समीक्षित शिक्षण संसाधन। प्रदाता की वर्तमान शर्तें और कीमत जाँचें।"
                      : "Reviewed learning resources. Always confirm the provider’s current terms and price."}
                  </p>
                </div>
              </div>
              {courses.items.length ? (
                <div className="stack-sm">
                  {courses.items.map((course) => (
                    <Link className="test-list-card" href={`/${locale}/courses/${course.id}`} key={course.id}>
                      <span className="feature-icon">
                        <BookOpen size={17} aria-hidden="true" />
                      </span>
                      <div className="spacer">
                        <div className="section-title">{course.title}</div>
                        <div className="tiny muted">
                          {course.provider} · {course.level} · {course.format}
                        </div>
                      </div>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-inline">{locale === "hi" ? "कोर्स जल्द आएँगे।" : "Courses are coming soon."}</div>
              )}
              <Link className="section-head-link mt-3" href={`/${locale}/courses`}>
                {locale === "hi" ? "सभी कोर्स" : "Browse all courses"}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>

            <div>
              <div className="section-head">
                <div>
                  <h2>{locale === "hi" ? "वास्तविक परिस्थितियों में अभ्यास" : "Practice under realistic conditions"}</h2>
                  <p>
                    {locale === "hi"
                      ? "समयबद्ध मॉक टेस्ट, स्वतःसहेजन और जमा करने के बाद उत्तर व्याख्या।"
                      : "Timed mock tests with autosave and answer explanations after submission."}
                  </p>
                </div>
              </div>
              {tests.items.length ? (
                <div className="stack-sm">
                  {tests.items.map((test) => (
                    <Link className="test-list-card" href={`/${locale}/mock-tests/${test.id}`} key={test.id}>
                      <span className="feature-icon feature-icon-coral">
                        <Clock3 size={17} aria-hidden="true" />
                      </span>
                      <div className="spacer">
                        <div className="section-title">{test.title}</div>
                        <div className="tiny muted">
                          {test.duration_minutes} {locale === "hi" ? "मिनट" : "minutes"} · {test.pass_score}% {locale === "hi" ? "उत्तीर्ण" : "pass"}
                        </div>
                      </div>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-inline">{locale === "hi" ? "मॉक टेस्ट जल्द आएँगे।" : "Mock tests are coming soon."}</div>
              )}
              <Link className="section-head-link mt-3" href={`/${locale}/mock-tests`}>
                {locale === "hi" ? "सभी मॉक टेस्ट" : "Browse all mock tests"}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <div className="cta-band">
            <div>
              <h2>{locale === "hi" ? "पहले से टीम का हिस्सा हैं?" : "Already part of the team?"}</h2>
              <p>
                {locale === "hi"
                  ? "अनुमोदित पॉलिसी प्रश्न पूछें, अवकाश संभालें, HR अनुरोध उठाएँ और ऑनबोर्डिंग पूरी करें।"
                  : "Sign in to ask approved policy questions, manage leave, raise HR requests and complete onboarding."}
              </p>
            </div>
            <Link className="btn btn-lg" href={`/${locale}/sign-in`}>
              {locale === "hi" ? "कार्यक्षेत्र में साइन इन करें" : "Sign in to your workspace"}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <div className="public-container">
        <p className="footer-note" style={{ maxWidth: "none", textAlign: "center", paddingBottom: 10 }}>
          {locale === "hi"
            ? "करियर जानकारी सामान्य मार्गदर्शन के लिए है। निर्णय से पहले आधिकारिक स्रोत से आवश्यकताएँ सत्यापित करें।"
            : "Career information is provided for general guidance. Verify requirements with the official source before making a decision."}
        </p>
      </div>
    </>
  );
}
