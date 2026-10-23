import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { normalizeLocale, type Locale } from "@/lib/i18n";

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale = normalizeLocale(params.locale);
  return {
    title: locale === "hi" ? "गोपनीयता सूचना" : "Privacy notice",
    description:
      locale === "hi"
        ? "HR Assist करियर खातों और आंतरिक HR कार्यक्षेत्र के लिए गोपनीयता सूचना।"
        : "Privacy notice for HR Assist career accounts and the internal HR workspace.",
    alternates: { canonical: `/${locale}/privacy` },
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
    contact: string;
  }
> = {
  en: {
    eyebrow: "Privacy",
    title: "Privacy notice",
    intro:
      "This notice explains what HR Assist stores, why it is needed, and the choices you have. It covers both public career accounts and the internal HR workspace.",
    updated: "Last updated: 23 October 2026 · Version 1.0",
    sections: [
      {
        heading: "What we collect",
        body: [
          "Account details you provide, such as your name, email address and preferred language.",
          "Career-account activity: resume profile content, mock-test attempts and answers, and content reports you send.",
          "For internal employees, HR records needed to deliver the workspace: leave, service requests, onboarding tasks and recruitment activity. These records are only visible to you and authorised HR roles.",
          "Technical information needed to keep the service secure, such as session identifiers and basic request logs. We do not use advertising trackers.",
        ],
      },
      {
        heading: "Why we use it",
        body: [
          "To sign you in, keep your session secure and show the workspace or career pages that match your account type.",
          "To save your resume profile and practice-test progress so you can return to them.",
          "To route content reports to the editorial team and HR requests to the right approvers.",
          "To meet audit, security and legal obligations. AI guidance is advisory and never makes an employment decision on its own.",
        ],
      },
      {
        heading: "Who can see it",
        body: [
          "Public career accounts: only you can see your resume profile, attempts and results. Content reports are visible to authorised editorial staff.",
          "Internal accounts: access follows your role permissions. HR data is not shared with public career users or other tenants.",
          "We do not sell personal information. Service providers who host or support the platform may process data under contract and only on our instructions.",
        ],
      },
      {
        heading: "Retention and your choices",
        body: [
          "We keep account and workspace records for as long as your account is active and for the period required by applicable record-keeping rules.",
          "You can ask to access, correct or delete your career-account data, or withdraw consent where consent is the basis for processing. Some HR records may need to be retained for legal reasons.",
          "You can switch language at any time. Signing out ends the session on that device.",
        ],
      },
    ],
    contact:
      "For privacy questions or requests, contact your organisation’s HR administrator. Public career users can use the content feedback page and include a contact request.",
  },
  hi: {
    eyebrow: "गोपनीयता",
    title: "गोपनीयता सूचना",
    intro:
      "यह सूचना बताती है कि HR Assist क्या संग्रहीत करता है, क्यों आवश्यक है और आपके पास कौन-से विकल्प हैं। यह सार्वजनिक करियर खातों और आंतरिक HR कार्यक्षेत्र दोनों पर लागू होती है।",
    updated: "अंतिम अद्यतन: 23 अक्टूबर 2026 · संस्करण 1.0",
    sections: [
      {
        heading: "हम क्या एकत्र करते हैं",
        body: [
          "आपके द्वारा दी गई खाता जानकारी, जैसे नाम, ईमेल पता और पसंदीदा भाषा।",
          "करियर-खाता गतिविधि: रिज़्यूमे प्रोफ़ाइल सामग्री, मॉक-टेस्ट प्रयास और उत्तर, तथा आपकी भेजी गई सामग्री रिपोर्ट।",
          "आंतरिक कर्मचारियों के लिए, कार्यक्षेत्र चलाने हेतु आवश्यक HR रिकॉर्ड: अवकाश, सेवा अनुरोध, ऑनबोर्डिंग कार्य और भर्ती गतिविधि। ये रिकॉर्ड केवल आपको और अधिकृत HR भूमिकाओं को दिखते हैं।",
          "सेवा को सुरक्षित रखने के लिए आवश्यक तकनीकी जानकारी, जैसे सत्र पहचानकर्ता और बुनियादी अनुरोध लॉग। हम विज्ञापन ट्रैकर का उपयोग नहीं करते।",
        ],
      },
      {
        heading: "हम इसका उपयोग क्यों करते हैं",
        body: [
          "आपको साइन इन कराने, सत्र सुरक्षित रखने और आपके खाता प्रकार के अनुसार कार्यक्षेत्र या करियर पृष्ठ दिखाने के लिए।",
          "आपकी रिज़्यूमे प्रोफ़ाइल और अभ्यास-टेस्ट प्रगति सहेजने के लिए, ताकि आप बाद में लौट सकें।",
          "सामग्री रिपोर्ट संपादकीय टीम तक और HR अनुरोध सही अनुमोदकों तक पहुँचाने के लिए।",
          "ऑडिट, सुरक्षा और कानूनी दायित्व पूरे करने के लिए। AI मार्गदर्शन सलाहकारी है और स्वयं कोई रोजगार निर्णय नहीं लेता।",
        ],
      },
      {
        heading: "इसे कौन देख सकता है",
        body: [
          "सार्वजनिक करियर खाते: आपकी रिज़्यूमे प्रोफ़ाइल, प्रयास और परिणाम केवल आप देख सकते हैं। सामग्री रिपोर्ट अधिकृत संपादकीय कर्मचारियों को दिखती हैं।",
          "आंतरिक खाते: पहुँच आपकी भूमिका अनुमतियों के अनुसार होती है। HR डेटा सार्वजनिक करियर उपयोगकर्ताओं या अन्य टेनेंट के साथ साझा नहीं होता।",
          "हम व्यक्तिगत जानकारी नहीं बेचते। प्लेटफ़ॉर्म होस्ट या सहायता देने वाले सेवा प्रदाता अनुबंध के अंतर्गत और केवल हमारे निर्देश पर डेटा संसाधित कर सकते हैं।",
        ],
      },
      {
        heading: "संग्रहण अवधि और आपके विकल्प",
        body: [
          "जब तक आपका खाता सक्रिय है और लागू रिकॉर्ड-रखरखाव नियमों द्वारा आवश्यक अवधि तक हम खाता और कार्यक्षेत्र रिकॉर्ड रखते हैं।",
          "आप अपने करियर-खाता डेटा तक पहुँच, सुधार या हटाने का अनुरोध कर सकते हैं, या जहाँ सहमति आधार हो वहाँ सहमति वापस ले सकते हैं। कुछ HR रिकॉर्ड कानूनी कारणों से रखे जा सकते हैं।",
          "आप कभी भी भाषा बदल सकते हैं। साइन आउट करने पर उस डिवाइस पर सत्र समाप्त हो जाता है।",
        ],
      },
    ],
    contact:
      "गोपनीयता संबंधी प्रश्न या अनुरोध के लिए अपने संगठन के HR प्रशासक से संपर्क करें। सार्वजनिक करियर उपयोगकर्ता सामग्री प्रतिक्रिया पृष्ठ का उपयोग कर संपर्क अनुरोध शामिल कर सकते हैं।",
  },
};

export default function PrivacyPage({
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
            <ShieldCheck size={13} aria-hidden="true" />
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
            <p className="section-copy">{text.contact}</p>
            <div className="row wrap">
              <Link className="btn btn-secondary btn-sm" href={`/${locale}/terms`}>
                {locale === "hi" ? "उपयोग की शर्तें" : "Terms of use"}
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
