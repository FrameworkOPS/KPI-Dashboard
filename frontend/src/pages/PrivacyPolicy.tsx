import React from 'react'
import { Link } from 'react-router-dom'

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-white py-12 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">KPI Dashboard</h1>
            <Link
              to="/login"
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              ← Back to App
            </Link>
          </div>
          <div className="border-b border-slate-700" />
        </div>

        {/* Main Card */}
        <div className="bg-slate-800 rounded-xl p-8">
          <h2 className="text-3xl font-bold text-white mb-2">
            Privacy Policy
          </h2>
          <p className="text-slate-400 text-sm mb-1">
            <span className="font-medium text-slate-300">Effective Date:</span> April 1, 2025
          </p>
          <p className="text-slate-400 text-sm mb-8">
            <span className="font-medium text-slate-300">Last Updated:</span> April 1, 2025
          </p>

          <p className="text-slate-300 mb-8 leading-relaxed">
            This Privacy Policy describes how <span className="text-white font-medium">FrameworkOPS LLC</span>{' '}
            ("FrameworkOPS," "we," "us," or "our") collects, uses, discloses, and protects information in
            connection with your use of the <span className="text-white font-medium">KPI Dashboard</span>{' '}
            application ("the App"). By using the App, you agree to the practices described in this policy.
          </p>

          <div className="space-y-10">

            {/* Section 1 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">1.</span>Introduction
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                FrameworkOPS LLC is committed to protecting the privacy and security of your information. The
                KPI Dashboard is a business intelligence and performance management platform that helps
                organizations track key performance indicators, goals, and operational metrics. In doing so,
                we access and process certain business and personal data on your behalf.
              </p>
              <p className="text-slate-300 leading-relaxed">
                This policy applies to all users of the KPI Dashboard application, including administrators,
                leadership users, and standard users. It covers data collected directly through the App as
                well as data accessed through authorized third-party integrations.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">2.</span>Information We Collect
              </h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                We collect the following categories of information:
              </p>

              <div className="space-y-5">
                <div>
                  <h4 className="text-white font-medium mb-2">Account Information</h4>
                  <p className="text-slate-300 leading-relaxed">
                    When an account is created for you, we collect your name, email address, job role, and
                    assigned access level (Admin, Leadership, or User). This information is used to authenticate
                    you and provide appropriate access to the App's features.
                  </p>
                </div>

                <div>
                  <h4 className="text-white font-medium mb-2">Business Data</h4>
                  <p className="text-slate-300 leading-relaxed">
                    We collect and store business data that you or your organization enters into the App,
                    including KPIs, performance goals, rocks (quarterly priorities), issues, to-dos, meeting
                    notes, organizational charts, and other operational metrics. This data belongs to your
                    organization and is processed solely to provide the App's services.
                  </p>
                </div>

                <div>
                  <h4 className="text-white font-medium mb-2">Usage Data</h4>
                  <p className="text-slate-300 leading-relaxed">
                    We may collect information about how you interact with the App, including login timestamps,
                    pages visited, features used, and session duration. This data helps us maintain App
                    performance, troubleshoot issues, and improve the user experience.
                  </p>
                </div>

                <div>
                  <h4 className="text-white font-medium mb-2">Third-Party Integration Data</h4>
                  <p className="text-slate-300 leading-relaxed">
                    When you authorize connections to third-party services, we access data from those services
                    on your behalf. This includes financial data from <span className="text-white font-medium">QuickBooks Online</span> (such as
                    profit and loss reports, income, and expense data). We only access the data categories you
                    authorize and that are necessary to display your KPIs.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">3.</span>How We Use Your Information
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                We use the information we collect for the following purposes:
              </p>
              <ul className="text-slate-300 space-y-2 list-none pl-4">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Provide and operate the service:</span> To authenticate users, display dashboards, manage data, and deliver the core functionality of the KPI Dashboard.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Display business metrics and KPIs:</span> To aggregate, calculate, and present your organization's performance data in meaningful dashboards and reports.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Sync data from connected services:</span> To retrieve and display data from QuickBooks Online as authorized by you, keeping your KPI data current.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Maintain and improve the application:</span> To monitor performance, fix bugs, and enhance features based on usage patterns.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Communicate with you:</span> To send important notices about the App, including updates to this Privacy Policy or our Terms of Service.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Legal compliance:</span> To comply with applicable laws, regulations, and legal processes.</span>
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">4.</span>Data Sharing and Disclosure
              </h3>
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 mb-4">
                <p className="text-blue-300 font-medium">
                  We do NOT sell, rent, or trade your personal data or business data to third parties.
                </p>
              </div>
              <p className="text-slate-300 leading-relaxed mb-4">
                We may share your information only in the following limited circumstances:
              </p>
              <div className="space-y-4">
                <div>
                  <h4 className="text-white font-medium mb-2">Service Providers</h4>
                  <p className="text-slate-300 leading-relaxed">
                    We use trusted service providers to host and operate the App, including Railway (application
                    hosting and PostgreSQL database). These providers are contractually obligated to protect your
                    data and may not use it for any purpose other than providing services to us.
                  </p>
                </div>
                <div>
                  <h4 className="text-white font-medium mb-2">QuickBooks Online</h4>
                  <p className="text-slate-300 leading-relaxed">
                    We access your QuickBooks Online accounting data only as specifically authorized by you. We
                    do not share your QuickBooks data with any third party other than as described in this policy.
                  </p>
                </div>
                <div>
                  <h4 className="text-white font-medium mb-2">Legal Requirements</h4>
                  <p className="text-slate-300 leading-relaxed">
                    We may disclose your information if required to do so by law, regulation, court order, or
                    valid legal process, or if we believe in good faith that such disclosure is necessary to
                    protect the rights, property, or safety of FrameworkOPS, our users, or the public.
                  </p>
                </div>
                <div>
                  <h4 className="text-white font-medium mb-2">Business Transfers</h4>
                  <p className="text-slate-300 leading-relaxed">
                    In the event of a merger, acquisition, or sale of all or substantially all of our assets,
                    your information may be transferred as part of that transaction. We will notify you of any
                    such change.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 5 — QBO specific, highlighted for Intuit review */}
            <section>
              <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-6">
                <h3 className="text-xl font-semibold text-white mb-3">
                  <span className="text-blue-400 mr-2">5.</span>QuickBooks Online Data
                </h3>
                <p className="text-slate-300 leading-relaxed mb-4">
                  This section specifically describes our practices regarding data accessed through the
                  QuickBooks Online integration, in accordance with Intuit's developer requirements.
                </p>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-white font-medium mb-2">What Data We Access</h4>
                    <p className="text-slate-300 leading-relaxed">
                      With your explicit authorization, we access the following QuickBooks Online data:
                      Profit and Loss reports, income summaries, expense summaries, and other financial
                      report data necessary to calculate and display your financial KPIs. We access this
                      data in read-only fashion — we do not create, modify, or delete any data within
                      your QuickBooks Online account.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-white font-medium mb-2">Why We Access It</h4>
                    <p className="text-slate-300 leading-relaxed">
                      We access QuickBooks Online data solely to display financial metrics within your
                      KPI Dashboard. This enables your organization to view financial KPIs such as monthly
                      revenue, expenses, net income, and gross profit alongside your other operational metrics,
                      all in one place.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-white font-medium mb-2">How Long Data Is Retained</h4>
                    <p className="text-slate-300 leading-relaxed">
                      Financial data retrieved from QuickBooks Online is cached in our database only as long
                      as necessary to display it within the App. We do not retain historical QuickBooks data
                      beyond what is reasonably necessary to provide the service. Upon disconnection of your
                      QuickBooks integration or termination of your account, we will delete your cached
                      QuickBooks data.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-white font-medium mb-2">How to Revoke Access</h4>
                    <p className="text-slate-300 leading-relaxed">
                      You may revoke the KPI Dashboard's access to your QuickBooks Online account at any time
                      by: (a) disconnecting the integration within the KPI Dashboard's settings; or (b) visiting
                      your Intuit account at{' '}
                      <a
                        href="https://accounts.intuit.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        accounts.intuit.com
                      </a>{' '}
                      and removing KPI Dashboard from your authorized applications. Revoking access will
                      immediately stop our ability to retrieve new data from QuickBooks Online.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-white font-medium mb-2">No Sale or Sharing of QuickBooks Data</h4>
                    <p className="text-slate-300 leading-relaxed">
                      We do not sell, share, or use your QuickBooks Online data for any purpose other than
                      displaying it within your KPI Dashboard. We do not use your QuickBooks data for
                      advertising, analytics sold to third parties, or any purpose unrelated to providing
                      the KPI Dashboard service to you.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">6.</span>Data Security
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                We implement appropriate technical and organizational security measures to protect your
                information against unauthorized access, alteration, disclosure, or destruction. Our security
                practices include:
              </p>
              <ul className="text-slate-300 space-y-2 list-none pl-4">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Encryption in transit:</span> All data transmitted between your browser and our servers is encrypted using TLS (Transport Layer Security).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Secure authentication:</span> We use JSON Web Tokens (JWT) for session authentication, with tokens stored securely and subject to expiration.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Managed database hosting:</span> Your data is stored in a PostgreSQL database hosted on Railway, a managed cloud infrastructure provider with its own security controls.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Role-based access control:</span> Access to data within the App is governed by role-based permissions, limiting users to only the data they are authorized to view.</span>
                </li>
              </ul>
              <p className="text-slate-300 leading-relaxed mt-3">
                While we strive to use commercially acceptable security measures, no method of transmission
                over the internet or electronic storage is 100% secure. We cannot guarantee absolute security
                of your data.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">7.</span>Data Retention
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                We retain your information for as long as your account is active or as needed to provide
                you with the App's services. We also retain and use your information as necessary to comply
                with our legal obligations, resolve disputes, and enforce our agreements.
              </p>
              <p className="text-slate-300 leading-relaxed">
                Business data entered into the App (KPIs, goals, etc.) is retained for the duration of
                your organization's use of the service. Upon account termination or at your request, we will
                delete or anonymize your data within a reasonable timeframe, except where retention is
                required by law.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">8.</span>Your Rights
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                Depending on your location, you may have certain rights with respect to your personal
                information, including:
              </p>
              <ul className="text-slate-300 space-y-2 list-none pl-4">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Access:</span> The right to request a copy of the personal information we hold about you.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Correction:</span> The right to request correction of inaccurate or incomplete personal information.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Deletion:</span> The right to request deletion of your personal information, subject to certain legal limitations.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Portability:</span> The right to receive your data in a structured, machine-readable format where technically feasible.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Objection:</span> The right to object to certain processing of your personal information.</span>
                </li>
              </ul>
              <p className="text-slate-300 leading-relaxed mt-3">
                To exercise any of these rights, please contact us at{' '}
                <a href="mailto:privacy@frameworkops.com" className="text-blue-400 hover:text-blue-300 transition-colors">
                  privacy@frameworkops.com
                </a>
                . We will respond to your request within a reasonable timeframe and in accordance with
                applicable law.
              </p>
            </section>

            {/* Section 9 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">9.</span>Cookies and Local Storage
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                The KPI Dashboard uses minimal client-side storage. Specifically:
              </p>
              <ul className="text-slate-300 space-y-2 list-none pl-4">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Authentication token:</span> We store your JWT authentication token in your browser's localStorage to maintain your session between page loads. This token is used solely for authentication and is cleared when you log out.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span><span className="text-white font-medium">Session preferences:</span> We may store minimal user interface preferences (such as sidebar state) in localStorage to improve your experience.</span>
                </li>
              </ul>
              <p className="text-slate-300 leading-relaxed mt-3">
                We do not use third-party advertising cookies, tracking pixels, or analytics cookies. We do
                not use cookies for behavioral advertising or cross-site tracking.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">10.</span>Children's Privacy
              </h3>
              <p className="text-slate-300 leading-relaxed">
                The KPI Dashboard is a business productivity application and is not directed at or intended
                for use by children under the age of 13. We do not knowingly collect personal information
                from children under 13. If we become aware that a child under 13 has provided us with personal
                information, we will take steps to delete such information promptly. If you believe a child
                under 13 has provided information to us, please contact us at{' '}
                <a href="mailto:privacy@frameworkops.com" className="text-blue-400 hover:text-blue-300 transition-colors">
                  privacy@frameworkops.com
                </a>.
              </p>
            </section>

            {/* Section 11 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">11.</span>Changes to This Policy
              </h3>
              <p className="text-slate-300 leading-relaxed">
                We may update this Privacy Policy from time to time to reflect changes in our practices,
                technology, legal requirements, or other factors. We will notify you of any material changes
                by posting the updated policy within the App or by sending notice to the email address
                associated with your account, with a revised "Last Updated" date. Your continued use of
                the App after the effective date of any changes constitutes your acceptance of the revised
                Privacy Policy.
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">12.</span>Contact Us
              </h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                If you have any questions, concerns, or requests regarding this Privacy Policy or our data
                practices, please contact our privacy team:
              </p>
              <div className="bg-slate-700 rounded-lg p-5 space-y-2">
                <p className="text-white font-medium">FrameworkOPS LLC — Privacy</p>
                <p className="text-slate-300">
                  Email:{' '}
                  <a
                    href="mailto:privacy@frameworkops.com"
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    privacy@frameworkops.com
                  </a>
                </p>
              </div>
            </section>

          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              © 2025 FrameworkOPS LLC. All rights reserved.
            </p>
            <div className="flex gap-4 text-sm">
              <Link to="/eula" className="text-blue-400 hover:text-blue-300 transition-colors">
                EULA
              </Link>
              <Link to="/login" className="text-slate-400 hover:text-slate-300 transition-colors">
                Back to App
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default PrivacyPolicy
