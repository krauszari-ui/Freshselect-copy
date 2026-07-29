import { Leaf, Mail, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center">
              <Leaf className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-green-800 font-serif">FreshSelect Meals</h1>
              <p className="text-xs text-stone-500">SCN Approved Vendor</p>
            </div>
          </div>
          <Link href="/" className="flex items-center gap-1 text-sm text-stone-600 hover:text-green-700">
            <ChevronLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-green-800 font-serif mb-2">Privacy Policy</h1>
        <p className="text-stone-500 mb-8">Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

        <div className="prose prose-stone max-w-none space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">1. Introduction</h2>
            <p className="text-stone-700 leading-relaxed">
              FreshSelect Meals ("we," "us," or "our") is a New York State Social Care Network (SCN) approved vendor that provides nutrition services to eligible Medicaid members. We are committed to protecting the privacy and security of your personal information, including Protected Health Information (PHI), in compliance with the Health Insurance Portability and Accountability Act of 1996 (HIPAA), the Health Information Technology for Economic and Clinical Health (HITECH) Act, and New York State privacy laws including New York Public Health Law Article 27-F and New York Civil Rights Law Section 79-l.
            </p>
            <p className="text-stone-700 leading-relaxed">
              This Privacy Policy describes how we collect, use, disclose, and safeguard your information when you use our services, including our online application form and meal assistance programs.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">2. Information We Collect</h2>
            <p className="text-stone-700 leading-relaxed">We collect the following categories of information to determine eligibility and provide nutrition services:</p>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-6 space-y-4">
              <div>
                <h3 className="font-bold text-stone-800">Personal Identification Information</h3>
                <p className="text-sm text-stone-600">Full name, date of birth, Medicaid Client Identification Number (CIN), contact information (phone, email, address).</p>
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Protected Health Information (PHI)</h3>
                <p className="text-sm text-stone-600">Health conditions, pregnancy/postpartum status, chronic illness information, substance use disorder status, HIV/AIDS status, mental health conditions, medication requirements, and dietary needs related to medical conditions.</p>
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Household Information</h3>
                <p className="text-sm text-stone-600">Household member names, dates of birth, Medicaid IDs, and household size for eligibility determination.</p>
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Benefits Information</h3>
                <p className="text-sm text-stone-600">Employment status, SNAP, WIC, TANF enrollment status, and other public benefit information.</p>
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Documents</h3>
                <p className="text-sm text-stone-600">Copies of Medicaid cards, birth certificates, and marriage licenses uploaded through our secure form.</p>
              </div>
              <div>
                <h3 className="font-bold text-stone-800">SCN Screening Data</h3>
                <p className="text-sm text-stone-600">Responses to the Social Care Network screening questionnaire, including living situation, food security indicators, and social determinants of health.</p>
              </div>
            </div>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">3. How We Use Your Information</h2>
            <p className="text-stone-700 leading-relaxed">We use your information solely for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2 text-stone-700">
              <li>To determine your eligibility for SCN Enhanced Nutrition Services</li>
              <li>To coordinate and deliver medically tailored meals, food prescriptions, pantry stocking, and cooking supplies</li>
              <li>To communicate with you about your application status and services</li>
              <li>To comply with Medicaid reporting requirements and SCN program obligations</li>
              <li>To coordinate with your Managed Care Organization (MCO) and Health Home as required by the SCN program</li>
              <li>To improve the quality of our nutrition services</li>
            </ul>
          </section>

          {/* HIPAA Compliance */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">4. HIPAA Compliance</h2>
            <p className="text-stone-700 leading-relaxed">
              As a Medicaid vendor handling PHI, we comply with all applicable provisions of HIPAA and the HITECH Act, including:
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 space-y-3">
              <div>
                <h3 className="font-bold text-stone-800">Privacy Rule (45 CFR Part 160 and Subparts A and E of Part 164)</h3>
                <p className="text-sm text-stone-600">We implement policies and procedures to protect the privacy of PHI, limit uses and disclosures to the minimum necessary, and provide you with rights regarding your health information.</p>
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Security Rule (45 CFR Part 160 and Subparts A and C of Part 164)</h3>
                <p className="text-sm text-stone-600">We implement administrative, physical, and technical safeguards to ensure the confidentiality, integrity, and availability of electronic PHI (ePHI).</p>
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Breach Notification Rule</h3>
                <p className="text-sm text-stone-600">In the event of a breach of unsecured PHI, we will notify affected individuals, the U.S. Department of Health and Human Services (HHS), and the New York State Attorney General as required by law.</p>
              </div>
            </div>
          </section>

          {/* NYS Specific Protections */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">5. New York State Specific Protections</h2>
            <p className="text-stone-700 leading-relaxed">In addition to federal HIPAA requirements, we comply with the following New York State laws:</p>
            <ul className="list-disc list-inside space-y-2 text-stone-700">
              <li><strong>NY Public Health Law Article 27-F:</strong> Provides heightened protections for HIV/AIDS-related information. We will not disclose HIV-related information without your specific written authorization.</li>
              <li><strong>NY Mental Hygiene Law Section 33.13:</strong> Protects the confidentiality of mental health records. Mental health information is subject to additional restrictions on disclosure.</li>
              <li><strong>NY Civil Rights Law Section 79-l:</strong> Protects the confidentiality of substance use disorder records, consistent with 42 CFR Part 2 federal regulations.</li>
              <li><strong>NY SHIELD Act (Stop Hacks and Improve Electronic Data Security):</strong> We implement reasonable safeguards to protect the security, confidentiality, and integrity of private information of New York residents.</li>
              <li><strong>NY General Business Law Section 899-aa:</strong> We will provide timely notification in the event of a security breach involving your personal information.</li>
            </ul>
          </section>

          {/* Data Security */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">6. Data Security Measures</h2>
            <p className="text-stone-700 leading-relaxed">We implement the following safeguards to protect your information:</p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
                <h3 className="font-bold text-stone-800 text-sm mb-2">Administrative Safeguards</h3>
                <ul className="text-xs text-stone-600 space-y-1">
                  <li>- Workforce training on HIPAA compliance</li>
                  <li>- Access controls based on role and need-to-know</li>
                  <li>- Regular risk assessments</li>
                  <li>- Incident response procedures</li>
                  <li>- Business Associate Agreements (BAAs)</li>
                </ul>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
                <h3 className="font-bold text-stone-800 text-sm mb-2">Technical Safeguards</h3>
                <ul className="text-xs text-stone-600 space-y-1">
                  <li>- Encryption of data in transit (TLS/SSL)</li>
                  <li>- Encryption of data at rest</li>
                  <li>- Unique user identification and authentication</li>
                  <li>- Automatic session timeouts</li>
                  <li>- Audit logging of access to PHI</li>
                </ul>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
                <h3 className="font-bold text-stone-800 text-sm mb-2">Physical Safeguards</h3>
                <ul className="text-xs text-stone-600 space-y-1">
                  <li>- Secure data center hosting</li>
                  <li>- Facility access controls</li>
                  <li>- Workstation security policies</li>
                  <li>- Device and media controls</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Disclosure */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">7. When We May Disclose Your Information</h2>
            <p className="text-stone-700 leading-relaxed">We may disclose your PHI without additional authorization only in the following circumstances as permitted by HIPAA and NYS law:</p>
            <ul className="list-disc list-inside space-y-2 text-stone-700">
              <li><strong>Treatment, Payment, and Health Care Operations:</strong> To coordinate your nutrition services with your health plan and healthcare providers.</li>
              <li><strong>SCN Program Requirements:</strong> To your Managed Care Organization (MCO) and the NYS Department of Health as required by the SCN program.</li>
              <li><strong>As Required by Law:</strong> When mandated by federal, state, or local law.</li>
              <li><strong>Public Health Activities:</strong> For public health reporting as required by the NYS Department of Health.</li>
            </ul>
            <p className="text-stone-700 leading-relaxed mt-3">
              We will <strong>never</strong> sell your personal information or use it for marketing purposes. Any disclosure not listed above requires your explicit written authorization.
            </p>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">8. Your Rights Under HIPAA and NYS Law</h2>
            <p className="text-stone-700 leading-relaxed">You have the following rights regarding your health information:</p>
            <ul className="list-disc list-inside space-y-2 text-stone-700">
              <li><strong>Right to Access:</strong> You may request a copy of your PHI that we maintain.</li>
              <li><strong>Right to Amend:</strong> You may request corrections to your PHI if you believe it is inaccurate or incomplete.</li>
              <li><strong>Right to an Accounting of Disclosures:</strong> You may request a list of certain disclosures we have made of your PHI.</li>
              <li><strong>Right to Request Restrictions:</strong> You may request restrictions on how we use or disclose your PHI.</li>
              <li><strong>Right to Confidential Communications:</strong> You may request that we communicate with you through alternative means or at alternative locations.</li>
              <li><strong>Right to Revoke Authorization:</strong> You may revoke any written authorization you have given us at any time, except to the extent we have already acted on it.</li>
              <li><strong>Right to File a Complaint:</strong> You may file a complaint with us or with the U.S. Department of Health and Human Services if you believe your privacy rights have been violated.</li>
            </ul>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">9. Data Retention</h2>
            <p className="text-stone-700 leading-relaxed">
              We retain your PHI for a minimum of six (6) years from the date of creation or the date when it was last in effect, whichever is later, as required by HIPAA (45 CFR 164.530(j)). New York State law may require longer retention periods for certain types of records. After the applicable retention period, records are securely destroyed in accordance with our data destruction policies.
            </p>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">10. Children's Privacy</h2>
            <p className="text-stone-700 leading-relaxed">
              When we collect information about minor children as part of household eligibility determinations, a parent or legal guardian must provide consent. We apply the same HIPAA protections to children's PHI as we do to adult PHI, with additional protections as required by New York State law.
            </p>
          </section>

          {/* Changes to Policy */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">11. Changes to This Privacy Policy</h2>
            <p className="text-stone-700 leading-relaxed">
              We reserve the right to update this Privacy Policy at any time. If we make material changes to how we treat your PHI, we will notify you by posting the updated policy on this page with a new "Last Updated" date. We encourage you to review this policy periodically.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-bold text-green-800 font-serif border-b border-stone-200 pb-2">12. Contact Information</h2>
            <p className="text-stone-700 leading-relaxed">
              If you have questions about this Privacy Policy, wish to exercise your rights, or want to file a complaint, please contact our Privacy Officer:
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mt-4">
              <p className="font-bold text-green-800">FreshSelect Meals - Privacy Officer</p>
              <p className="text-stone-600 flex items-center gap-2 mt-2">
                <Mail className="w-4 h-4" /> info@freshselectmeals.com
              </p>
              <p className="text-stone-600 mt-4 text-sm">
                You may also file a complaint with the U.S. Department of Health and Human Services Office for Civil Rights at{" "}
                <a href="https://www.hhs.gov/ocr" className="text-green-700 underline" target="_blank" rel="noopener noreferrer">
                  www.hhs.gov/ocr
                </a>
                {" "}or the New York State Attorney General at{" "}
                <a href="https://ag.ny.gov" className="text-green-700 underline" target="_blank" rel="noopener noreferrer">
                  ag.ny.gov
                </a>.
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-500">
          <div className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-green-600" />
            <span>FreshSelect Meals</span>
          </div>
          <span>&copy; {new Date().getFullYear()} FreshSelect Meals. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
