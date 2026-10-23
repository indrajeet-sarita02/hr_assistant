import type { Metadata } from "next";
import Link from "next/link";
import { Accessibility } from "lucide-react";

import { normalizeLocale, type Locale } from "@/lib/i18n";

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale = normalizeLocale(params.locale);
  return {
    title: locale === "hi" ? "सुगम्यता" : "Accessibility",
    description:
      locale === "hi"
        ? "HR Assist की सुगम्यता प्रतिबद्धता, समर्थित सुविधाएँ और प्रतिक्रिया कैसे दें।"
        : "HR Assist accessibility commitment, supported features and how to give feedback.",
    alternates: { canonical: `/${locale}/accessibility` },
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
    feedback: string;
  }
> = {
  en: {
    eyebrow: "Accessibility",
    title: "Accessibility commitment",
    intro:
      "HR Assist aims to be usable by everyone who needs it, including people who use keyboards, screen readers, magnification or reduced-motion settings.",
    updated: "Last reviewed: 23 October 2026 · Target: WCAG 2.1 AA",
    sections: [
      {
        heading: "What we support",
        body: [
          "Every page starts with a skip link and uses landmarks so screen-reader users can move directly to the main content.",
          "Interactive controls are reachable by keyboard with visible focus. Forms use explicit labels, required-field markers and inline error messages tied to the field.",
          "Colour is not the only way status is communicated; badges include text labels. Body text aims for a 4.5:1 contrast ratio against its background.",
          "The interface is bilingual (English and Hindi), responsive down to small mobile widths, and respects reduced-motion preferences for animation.",
        ],
      },
      {
        heading: "Plain language",
        body: [
          "We avoid unexplained HR jargon and label estimates, deferred features and AI-generated guidance clearly.",
          "Dates, numbers and currency follow the selected locale where the underlying data allows it.",
        ],
      },
      {
        heading: "Known limitations",
        body: [
          "This is a local evaluation build. Some dense admin tables and long audit lists may be harder to navigate with a screen reader, and improvements are still in progress.",
          "Uploaded documents are metadata-only in this build, so there is no accessible document preview yet.",
          "Third-party course websites are outside our control and may not meet the same standard.",
        ],
      },
      {
        heading: "Tell us about a barrier",
        body: [
          "If something blocks you, use the content feedback page and describe the page, what you were trying to do and any assistive technology you use.",
          "Include a contact request in your report if you would like a reply. We review accessibility reports alongside other content reports.",
        ],
      },
    ],
    feedback: "Report an accessibility barrier",
  },
  hi: {
    eyebrow: "सुगम्यता",
    title: "सुगम्यता प्रतिबद्धता",
    intro:
      "HR Assist का लक्ष्य इसे हर आवश्यकता वाले व्यक्ति के लिए उपयोगी बनाना है, जिनमें कीबोर्ड, स्क्रीन रीडर, मैग्निफ़िकेशन या कम-गति सेटिंग्स का उपयोग करने वाले लोग शामिल हैं।",
    updated: "अंतिम समीक्षा: 23 अक्टूबर 2026 · लक्ष्य: WCAG 2.1 AA",
    sections: [
      {
        heading: "हम क्या समर्थित करते हैं",
        body: [
          "प्रत्येक पृष्ठ स्किप लिंक से शुरू होता है और लैंडमार्क का उपयोग करता है, ताकि स्क्रीन-रीडर उपयोगकर्ता सीधे मुख्य सामग्री पर जा सकें।",
          "इंटरैक्टिव नियंत्रण कीबोर्ड से सुलभ हैं और फ़ोकस दिखाई देता है। फ़ॉर्म में स्पष्ट लेबल, आवश्यक-फ़ील्ड चिह्न और फ़ील्ड से जुड़े इनलाइन त्रुटि संदेश हैं।",
          "स्थिति बताने के लिए केवल रंग पर निर्भरता नहीं है; बैज में पाठ लेबल शामिल हैं। मुख्य पाठ का पृष्ठभूमि के साथ 4.5:1 कंट्रास्ट अनुपात लक्ष्य है।",
          "इंटरफ़ेस द्विभाषी (अंग्रेज़ी और हिन्दी) है, छोटी मोबाइल चौड़ाई तक प्रतिक्रियाशील है, और एनिमेशन के लिए कम-गति प्राथमिकताओं का सम्मान करता है।",
        ],
      },
      {
        heading: "सरल भाषा",
        body: [
          "हम अनसुलझे HR शब्दजाल से बचते हैं और अनुमान, स्थगित सुविधाएँ तथा AI-निर्मित मार्गदर्शन स्पष्ट रूप से चिह्नित करते हैं।",
          "जहाँ अंतर्निहित डेटा अनुमति देता है, तिथियाँ, संख्याएँ और मुद्रा चयनित लोकेल का पालन करती हैं।",
        ],
      },
      {
        heading: "ज्ञात सीमाएँ",
        body: [
          "यह स्थानीय मूल्यांकन बिल्ड है। कुछ घनी प्रशासनिक तालिकाएँ और लंबी ऑडिट सूचियाँ स्क्रीन रीडर से नेविगेट करना कठिन हो सकती हैं, और सुधार जारी हैं।",
          "इस बिल्ड में अपलोड किए गए दस्तावेज़ केवल मेटाडेटा हैं, इसलिए अभी सुलभ दस्तावेज़ पूर्वावलोकन नहीं है।",
          "तृतीय-पक्ष कोर्स वेबसाइटें हमारे नियंत्रण से बाहर हैं और समान मानक पूरा न कर सकें।",
        ],
      },
      {
        heading: "बाधा की जानकारी दें",
        body: [
          "यदि कुछ आपको रोकता है, तो सामग्री प्रतिक्रिया पृष्ठ का उपयोग करें और पृष्ठ, आप क्या कर रहे थे तथा उपयोग की जा रही सहायक तकनीक बताएँ।",
          "उत्तर चाहते हैं तो अपनी रिपोर्ट में संपर्क अनुरोध शामिल करें। हम सुगम्यता रिपोर्ट की समीक्षा अन्य सामग्री रिपोर्ट के साथ करते हैं।",
        ],
      },
    ],
    feedback: "सुगम्यता बाधा की रिपोर्ट करें",
  },
};

export default function AccessibilityPage({
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
            <Accessibility size={13} aria-hidden="true" />
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
              <Link
                className="btn btn-primary btn-sm"
                href={`/${locale}/content-feedback`}
              >
                {text.feedback}
              </Link>
              <Link className="btn btn-secondary btn-sm" href={`/${locale}/privacy`}>
                {locale === "hi" ? "गोपनीयता सूचना" : "Privacy notice"}
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
