import React from 'react'
import { Link } from 'react-router-dom'

const EULA: React.FC = () => {
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
            End User License Agreement
          </h2>
          <p className="text-slate-400 text-sm mb-1">
            <span className="font-medium text-slate-300">Effective Date:</span> April 1, 2025
          </p>
          <p className="text-slate-400 text-sm mb-8">
            <span className="font-medium text-slate-300">Last Updated:</span> April 1, 2025
          </p>

          <p className="text-slate-300 mb-8 leading-relaxed">
            This End User License Agreement ("Agreement") is a legal agreement between you ("User," "you," or "your")
            and <span className="text-white font-medium">FrameworkOPS LLC</span> ("FrameworkOPS," "we," "us," or "our")
            governing your use of the <span className="text-white font-medium">KPI Dashboard</span> software application
            and related services (collectively, the "Software"). Please read this Agreement carefully before using the
            Software. By accessing or using the Software, you agree to be bound by the terms of this Agreement.
          </p>

          <div className="space-y-10">

            {/* Section 1 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">1.</span>Acceptance of Terms
              </h3>
              <p className="text-slate-300 leading-relaxed">
                By installing, accessing, or using the KPI Dashboard Software, you acknowledge that you have read,
                understood, and agree to be bound by this Agreement and all applicable laws and regulations. If you
                do not agree to the terms of this Agreement, you are not authorized to use the Software and must
                immediately cease all use. If you are entering into this Agreement on behalf of a company or other
                legal entity, you represent that you have the authority to bind such entity to this Agreement.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">2.</span>License Grant
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                Subject to the terms and conditions of this Agreement, FrameworkOPS LLC grants you a limited,
                non-exclusive, non-transferable, revocable license to access and use the KPI Dashboard Software
                solely for your internal business purposes. This license is conditioned on your continued
                compliance with all terms of this Agreement.
              </p>
              <p className="text-slate-300 leading-relaxed">
                This license permits you to: (a) access the Software through a supported web browser; (b) use the
                features and functionality made available to you based on your assigned user role; and (c) view,
                input, and manage business data within the Software as permitted by your role and subscription.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">3.</span>License Restrictions
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                You agree that you will not, directly or indirectly:
              </p>
              <ul className="text-slate-300 space-y-2 list-none pl-4">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span>Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Software;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span>Copy, modify, adapt, translate, or create derivative works based on the Software;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span>Redistribute, sell, resell, transfer, sublicense, or otherwise make the Software available to any third party;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span>Remove or alter any proprietary notices, labels, or marks on the Software;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span>Use the Software to develop a competing product or service;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span>Use the Software in any manner that could damage, disable, overburden, or impair FrameworkOPS's servers or networks;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1 shrink-0">•</span>
                  <span>Circumvent or attempt to circumvent any technical limitations or access controls in the Software.</span>
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">4.</span>User Accounts and Access
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                Access to the KPI Dashboard is managed through a role-based access control system. Users are
                assigned roles (such as Admin, Leadership, or standard User) that determine the features and data
                accessible within the application. You agree to use only the features and access levels granted
                to your assigned role.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                You are solely responsible for: (a) maintaining the confidentiality of your login credentials;
                (b) all activities that occur under your account; and (c) notifying FrameworkOPS immediately of
                any unauthorized use of your account or any other security breach.
              </p>
              <p className="text-slate-300 leading-relaxed">
                FrameworkOPS reserves the right to suspend or terminate your account if we reasonably believe
                your credentials have been compromised or that your account is being used in violation of this
                Agreement.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">5.</span>Intellectual Property
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                The KPI Dashboard Software, including all content, features, functionality, code, design, graphics,
                logos, and other materials, is owned by FrameworkOPS LLC and is protected by applicable intellectual
                property laws, including copyright, trademark, patent, and trade secret laws.
              </p>
              <p className="text-slate-300 leading-relaxed">
                FrameworkOPS retains all right, title, and interest in and to the Software. This Agreement does not
                grant you any ownership rights in the Software. All rights not expressly granted herein are reserved
                by FrameworkOPS. Any feedback, suggestions, or ideas you provide regarding the Software may be used
                by FrameworkOPS without obligation to you.
              </p>
            </section>

            {/* Section 6 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">6.</span>Third-Party Integrations
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                The KPI Dashboard may integrate with third-party services, including but not limited to
                <span className="text-white font-medium"> HubSpot</span> and{' '}
                <span className="text-white font-medium">QuickBooks Online</span> ("Third-Party Services").
                Your use of these Third-Party Services through the KPI Dashboard is subject to the respective
                terms of service, privacy policies, and end user license agreements of those third parties.
              </p>
              <p className="text-slate-300 leading-relaxed mb-3">
                You are solely responsible for: (a) ensuring your use of any Third-Party Service complies with
                that service's terms and conditions; (b) obtaining any necessary authorizations or subscriptions
                to use those Third-Party Services; and (c) any data you authorize the KPI Dashboard to access
                from such Third-Party Services.
              </p>
              <p className="text-slate-300 leading-relaxed">
                FrameworkOPS is not responsible for the availability, accuracy, or content of any Third-Party
                Services, and shall not be liable for any damages arising from your use of or reliance on
                such services.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">7.</span>Data and Privacy
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                FrameworkOPS collects and processes certain data in connection with your use of the Software.
                Our collection, use, and handling of such data is governed by our{' '}
                <Link to="/privacy" className="text-blue-400 hover:text-blue-300 underline transition-colors">
                  Privacy Policy
                </Link>
                , which is incorporated into this Agreement by reference.
              </p>
              <p className="text-slate-300 leading-relaxed">
                You represent and warrant that you have all necessary rights and consents to input any data into
                the Software, including any business data, personal information, or data obtained from Third-Party
                Services. You agree not to input any data into the Software that you do not have the right to share
                or process.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">8.</span>Confidentiality
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                You acknowledge that the Software and any associated documentation, technical data, trade secrets,
                or business information disclosed to you in connection with this Agreement ("Confidential Information")
                are proprietary to FrameworkOPS and constitute valuable trade secrets.
              </p>
              <p className="text-slate-300 leading-relaxed">
                You agree to: (a) hold all Confidential Information in strict confidence; (b) not disclose
                Confidential Information to any third party without FrameworkOPS's prior written consent; and
                (c) use Confidential Information solely for the purpose of using the Software as permitted under
                this Agreement. These obligations shall survive termination of this Agreement.
              </p>
            </section>

            {/* Section 9 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">9.</span>Disclaimer of Warranties
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3 uppercase text-sm tracking-wide font-medium text-slate-400">
                THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND.
              </p>
              <p className="text-slate-300 leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, FRAMEWORKOPS LLC EXPRESSLY DISCLAIMS ALL
                WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION
                ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
                NON-INFRINGEMENT. FRAMEWORKOPS DOES NOT WARRANT THAT THE SOFTWARE WILL BE UNINTERRUPTED,
                ERROR-FREE, OR SECURE, OR THAT ANY DEFECTS WILL BE CORRECTED. YOUR USE OF THE SOFTWARE IS
                AT YOUR SOLE RISK.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">10.</span>Limitation of Liability
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL FRAMEWORKOPS LLC, ITS
                OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
                SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES
                FOR LOSS OF PROFITS, REVENUE, DATA, BUSINESS, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING
                OUT OF OR IN CONNECTION WITH THIS AGREEMENT OR YOUR USE OF THE SOFTWARE, EVEN IF FRAMEWORKOPS
                HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
              <p className="text-slate-300 leading-relaxed">
                IN NO EVENT SHALL FRAMEWORKOPS'S TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING
                OUT OF OR RELATED TO THIS AGREEMENT EXCEED THE TOTAL FEES PAID BY YOU TO FRAMEWORKOPS IN
                THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO SUCH LIABILITY. IF
                YOU HAVE NOT PAID ANY FEES, FRAMEWORKOPS'S TOTAL LIABILITY SHALL NOT EXCEED ONE HUNDRED
                DOLLARS ($100.00).
              </p>
            </section>

            {/* Section 11 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">11.</span>Indemnification
              </h3>
              <p className="text-slate-300 leading-relaxed">
                You agree to indemnify, defend, and hold harmless FrameworkOPS LLC and its officers, directors,
                employees, agents, and affiliates from and against any and all claims, damages, losses, liabilities,
                costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your
                use of the Software in violation of this Agreement; (b) your violation of any applicable law or
                regulation; (c) your violation of any third-party rights, including intellectual property rights or
                privacy rights; or (d) any data you submit to or through the Software.
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">12.</span>Term and Termination
              </h3>
              <p className="text-slate-300 leading-relaxed mb-3">
                This Agreement is effective as of the date you first access or use the Software and shall continue
                until terminated. FrameworkOPS may terminate this Agreement and your access to the Software at
                any time, with or without cause, upon notice to you. You may terminate this Agreement at any time
                by ceasing all use of the Software.
              </p>
              <p className="text-slate-300 leading-relaxed">
                Upon termination: (a) all licenses granted to you under this Agreement will immediately cease;
                (b) you must immediately stop all use of the Software; and (c) sections of this Agreement that by
                their nature should survive termination (including Sections 5, 8, 9, 10, 11, and 13) shall
                survive termination.
              </p>
            </section>

            {/* Section 13 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">13.</span>Governing Law
              </h3>
              <p className="text-slate-300 leading-relaxed">
                This Agreement shall be governed by and construed in accordance with the laws of the
                <span className="text-white font-medium"> State of Florida</span>, without regard to its conflict
                of laws principles. Any dispute arising out of or relating to this Agreement shall be subject to
                the exclusive jurisdiction of the state and federal courts located in Florida, and you hereby
                consent to personal jurisdiction in such courts. The United Nations Convention on Contracts for
                the International Sale of Goods does not apply to this Agreement.
              </p>
            </section>

            {/* Section 14 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">14.</span>Changes to Agreement
              </h3>
              <p className="text-slate-300 leading-relaxed">
                FrameworkOPS reserves the right to modify this Agreement at any time. We will notify you of any
                material changes by posting the updated Agreement within the Software or by sending notice to the
                email address associated with your account. Your continued use of the Software after the effective
                date of any changes constitutes your acceptance of the modified Agreement. If you do not agree to
                the modified Agreement, you must stop using the Software.
              </p>
            </section>

            {/* Section 15 */}
            <section>
              <h3 className="text-xl font-semibold text-white mb-3">
                <span className="text-blue-400 mr-2">15.</span>Contact Information
              </h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                If you have any questions about this Agreement or the KPI Dashboard Software, please contact us:
              </p>
              <div className="bg-slate-700 rounded-lg p-5 space-y-2">
                <p className="text-white font-medium">FrameworkOPS LLC</p>
                <p className="text-slate-300">
                  Email:{' '}
                  <a
                    href="mailto:legal@frameworkops.com"
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    legal@frameworkops.com
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
              <Link to="/privacy" className="text-blue-400 hover:text-blue-300 transition-colors">
                Privacy Policy
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

export default EULA
