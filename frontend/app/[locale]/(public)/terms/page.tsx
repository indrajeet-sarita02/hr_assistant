import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2 } from "lucide-react";

import { normalizeLocale, type Locale } from "@/lib/i18n";

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale = normalizeLocale(params.locale);
  return {
    title: locale === "hi" ? "उपयोग की शर्तें" : "Terms of use",
    description:
      locale === "hi"
        ? "HR Assist करियर खातों और आंतरिक HR कार्यक्षेत्र के उपयोग की शर्तें।"
        : "Terms of use for HR Assist career accounts and the internal HR workspace.",
    alternates: { canonical: `/${locale}/terms` },
  };
}

const copy: Record<
  Locale,
  {
    eyebrow: string;
    title: string;
    intro: string;
    updated: string;
    sections: Array<{ heading: string; body: string[] }>;
  }
> = {
  en: {
    eyebrow: "Terms",
    title: "Terms of use",
    intro:
      "These terms apply when you use the HR Assist career pages or the internal HR workspace. By creating an account or signing in, you agree to them.",
    updated: "Last updated: 23 October 2026 · Version 1.0",
    sections: [
      {
        heading: "Your account",
        body: [
          "Give accurate account details and keep your password confidential. You are responsible for activity carried out with your account.",
          "Public career accounts are for your own job-search and practice use. Internal accounts are for authorised employees of the organisation that invited you.",
          "Tell your HR administrator promptly if you believe your account or session has been misused.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "Do not attempt to access another person’s resume, attempts, HR requests or other private records.",
          "Do not upload unlawful, harmful or misleading material, interfere with the service, or use automated tools to scrape data.",
          "Content reports must be made in good faith. Repeated false or abusive reports may be restricted.",
        ],
      },
      {
        heading: "Guidance is advisory",
        body: [
          "Career guides, salary ranges, exam dates and AI answers are provided for general guidance. Always verify requirements with the official authority or your organisation.",
          "Nothing in HR Assist guarantees a job, interview, salary, admission or any other outcome.",
          "HR decisions remain with authorised people. The assistant does not approve leave, make hiring decisions or replace professional advice.",
        ],
      },
      {
        heading: "Content and availability",
        body: [
          "We aim to keep content accurate and source-checked, but information can become outdated. Report issues so the editorial team can review them.",
          "The service may be unavailable during maintenance or due to events outside our control. Features marked as deferred in this demo build are not yet available.",
          "Third-party course links open external websites. Their terms and prices are set by the provider.",
        ],
      },
      {
        heading: "Changes",
        body: [
          "We may update these terms as the product changes. Material changes will be highlighted in the product before they take effect.",
          "If you do not agree to an updated version, stop using the service and ask your administrator to close your account where applicable.",
        ],
      },
    ],
  },
  hi: {
    eyebrow: "शर्तें",
    title: "उपयोग की शर्तें",
    intro:
      "ये शर्तें HR Assist करियर पृष्ठों या आंतरिक HR कार्यक्षेत्र के उपयोग पर लागू होती हैं। खाता बनाकर या साइन इन करके आप इनसे सहमत होते हैं।",
    updated: "अंतिम अद्यतन: 23 अक्टूबर 2026 · संस्करण 1.0",
    sections: [
      {
        heading: "आपका खाता",
        body: [
          "सही खाता जानकारी दें और अपना पासवर्ड गोपनीय रखें। अपने खाते से की गई गतिविधि के लिए आप जिम्मेदार हैं।",
          "सार्वजनिक करियर खाते आपकी अपनी नौकरी-खोज और अभ्यास के लिए हैं। आंतरिक खाते उस संगठन के अधिकृत कर्मचारियों के लिए हैं जिसने आपको आमंत्रित किया।",
          "यदि आपको लगता है कि आपके खाते या सत्र का दुरुपयोग हुआ है, तो तुरंत अपने HR प्रशासक को बताएँ।",
        ],
      },
      {
        heading: "स्वीकार्य उपयोग",
        body: [
          "किसी अन्य व्यक्ति के रिज़्यूमे, प्रयास, HR अनुरोध या अन्य निजी रिकॉर्ड तक पहुँचने का प्रयास न करें।",
          "अवैध, हानिकारक या भ्रामक सामग्री अपलोड न करें, सेवा में बाधा न डालें, और डेटा एकत्र करने के लिए स्वचालित उपकरणों का उपयोग न करें।",
          "सामग्री रिपोर्ट सद्भावना से करें। बार-बार झूठी या दुरुपयोगी रिपोर्ट पर प्रतिबंध लगाया जा सकता है।",
        ],
      },
      {
        heading: "मार्गदर्शन सलाहकारी है",
        body: [
          "करियर गाइड, वेतन सीमाएँ, परीक्षा तिथियाँ और AI उत्तर सामान्य मार्गदर्शन के लिए हैं। आवश्यकताओं की पुष्टि हमेशा आधिकारिक प्राधिकरण या अपने संगठन से करें।",
          "HR Assist में कुछ भी नौकरी, साक्षात्कार, वेतन, प्रवेश या किसी अन्य परिणाम की गारंटी नहीं देता।",
          "HR निर्णय अधिकृत व्यक्तियों के पास रहते हैं। सहायक अवकाश स्वीकृत नहीं करता, भर्ती निर्णय नहीं लेता और पेशेवर सलाह का विकल्प नहीं है।",
        ],
      },
      {
        heading: "सामग्री और उपलब्धता",
        body: [
          "हम सामग्री को सटीक और स्रोत-जाँचित रखने का प्रयास करते हैं, लेकिन जानकारी पुरानी हो सकती है। समीक्षा के लिए समस्याएँ रिपोर्ट करें।",
          "रखरखाव या हमारे नियंत्रण से बाहर की घटनाओं के कारण सेवा अनुपलब्ध हो सकती है। इस डेमो बिल्ड में स्थगित चिह्नित सुविधाएँ अभी उपलब्ध नहीं हैं।",
          "तृतीय-पक्ष कोर्स लिंक बाहरी वेबसाइट खोलते हैं। उनकी शर्तें और कीमतें प्रदाता तय करता है।",
        ],
      },
      {
        heading: "परिवर्तन",
        body: [
          "उत्पाद बदलने के साथ हम इन शर्तों को अद्यतन कर सकते हैं। महत्वपूर्ण परिवर्तन लागू होने से पहले उत्पाद में दिखाए जाएँगे।",
          "यदि आप अद्यतन संस्करण से सहमत नहीं हैं, तो सेवा का उपयोग बंद करें और जहाँ लागू हो अपने प्रशासक से खाता बंद करने को कहें।",
        ],
      },
    ],
  },
};

export default function TermsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = normalizeLocale(params.locale);
  const text = copy[locale];

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="public-page-head">
          <span className="eyebrow">
            <FileCheck2 size={13} aria-hidden="true" />
            {text.eyebrow}
          </span>
          <h1>{text.title}</h1>
          <p className="section-copy">{text.intro}</p>
          <p className="tiny muted">{text.updated}</p>
        </div>

        <article className="card">
          <div className="card-body stack">
            {text.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.body.map((paragraph) => (
                  <p className="section-copy" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
            <div className="row wrap">
              <Link className="btn btn-secondary btn-sm" href={`/${locale}/privacy`}>
                {locale === "hi" ? "गोपनीयता सूचना" : "Privacy notice"}
              </Link>
              <Link
                className="btn btn-secondary btn-sm"
                href={`/${locale}/accessibility`}
              >
                {locale === "hi" ? "सुगम्यता" : "Accessibility"}
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
