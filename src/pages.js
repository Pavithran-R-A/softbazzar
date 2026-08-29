export const TELEGRAM = 'https://t.me/softbazzar';

export function privacyPage() {
  return `<div class="policy-page page-transition"><div class="policy-content">
    <h1>Privacy Policy</h1>
    <p class="policy-date">Last updated: August 29, 2026</p>
    <h2>1. Information We Collect</h2>
    <p>At SoftBazzar, we collect only the information necessary to process your orders and provide customer support. This includes:</p>
    <ul>
      <li>Information you choose to provide while arranging an order</li>
      <li>Payment confirmation information shared with the support team</li>
      <li>Communication data when you contact us via Telegram at <a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">t.me/softbazzar</a></li>
      <li>Basic website analytics and technical information used to understand site performance</li>
    </ul>
    <h2>2. How We Use Your Information</h2>
    <p>We use information supplied through the ordering and support process to:</p>
    <ul>
      <li>Process and deliver digital product orders</li>
      <li>Confirm order details and delivery information</li>
      <li>Provide customer support and respond to inquiries</li>
      <li>Improve the website experience and catalogue</li>
      <li>Prevent fraud and resolve transaction issues</li>
    </ul>
    <h2>3. Browser Storage and Cart Data</h2>
    <p>The storefront uses your browser's localStorage to keep a small cart between visits. The stored cart contains product identifiers, selected variant names and quantities only. Current prices are resolved again from the catalogue when the cart is displayed; checkout details and payment credentials are not stored in the cart.</p>
    <h2>4. Data Security</h2>
    <p>Do not share UPI PINs, private financial keys, passwords or other secret credentials through the website or support chat. Payment is arranged outside the website through the support process.</p>
    <h2>5. Third-Party Services</h2>
    <p>The website may use third-party services for hosting, analytics and communication. Those services operate under their own privacy terms. SoftBazzar does not intentionally sell customer information to advertisers.</p>
    <h2>6. Data Retention and Requests</h2>
    <p>Order and support records may be retained for as long as reasonably needed to deliver the order, handle support, prevent abuse and meet applicable obligations. You may contact us to ask about information associated with your order.</p>
    <h2>7. Changes to This Policy</h2>
    <p>We may update this Privacy Policy when the storefront or ordering process changes. Material changes will be reflected on this page with an updated revision date.</p>
    <h2>8. Contact Us</h2>
    <p>If you have questions about this Privacy Policy, please reach out on Telegram: <a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">@softbazzar</a>.</p>
  </div></div>`;
}

export function termsPage() {
  return `<div class="policy-page page-transition"><div class="policy-content">
    <h1>Terms & Conditions</h1>
    <p class="policy-date">Last updated: August 29, 2026</p>
    <h2>1. Acceptance of Terms</h2>
    <p>By accessing and using SoftBazzar ("the Website"), you agree to these Terms & Conditions. If you do not agree, do not place an order.</p>
    <h2>2. Products and Services</h2>
    <p>SoftBazzar lists digital subscriptions, software-related products and digital tools. Products are delivered digitally through the support process.</p>
    <ul>
      <li>Product availability and pricing may change</li>
      <li>The current catalogue price is re-checked when an order is prepared</li>
      <li>Delivery timing is confirmed through support after payment and availability checks</li>
      <li>Prices shown on the website are in Indian Rupees (₹)</li>
    </ul>
    <h2>3. Orders and Payment</h2>
    <p>An order is not final merely because a cart or pre-filled support message was created. The support team must confirm availability, the current price, the payment method and the order details before fulfilment.</p>
    <h2>4. Delivery Policy</h2>
    <p>Products are delivered digitally. Delivery timing depends on the product and availability. If an agreed delivery window is missed, contact us at <a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">t.me/softbazzar</a>.</p>
    <h2>5. Refund Policy</h2>
    <p>Refund eligibility depends on the order status, whether fulfilment has begun or credentials have been delivered, and whether a verified product issue can be corrected. Contact support promptly if there is a problem so the order can be reviewed.</p>
    <h2>6. User Responsibilities</h2>
    <p>You agree to provide accurate order information, use purchased access according to the applicable product terms, and avoid unauthorized resale or redistribution of credentials.</p>
    <h2>7. Limitation of Liability</h2>
    <p>Third-party products and services can change independently of SoftBazzar. To the extent permitted by applicable law, any remedy for a verified SoftBazzar order issue is limited to the affected order.</p>
    <h2>8. Abuse and Fraud</h2>
    <p>SoftBazzar may refuse or stop an order when there is evidence of fraud, abuse, payment manipulation or misuse of delivered credentials.</p>
    <h2>9. Contact Information</h2>
    <p>For questions about these Terms & Conditions, contact us on Telegram: <a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">@softbazzar</a>.</p>
  </div></div>`;
}
