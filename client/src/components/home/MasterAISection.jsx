import { useState, useEffect } from 'react';
import { Cpu, MousePointerClick, X, CheckCircle2 } from 'lucide-react';

/* =========================================================
   INDUSTRY ICONS
========================================================= */

const icons = {
  manufacturing: (
    <>
      <path d="M5 41V22l10 6v-6l10 6v-6l10 6V9h7v32z" fill="#F97316" />
      {[11, 18, 25, 32].map((x) => (
        <rect key={x} x={x} y="32" width="4" height="4" rx="0.8" fill="#fff" />
      ))}
    </>
  ),
  telecom: (
    <>
      <circle cx="24" cy="24" r="18" fill="#0EA5E9" />
      <circle cx="24" cy="24" r="11" fill="none" stroke="#fff" strokeWidth="1.6" strokeDasharray="22 5" />
      <circle cx="24" cy="24" r="5" fill="#fff" />
    </>
  ),
  battery: (
    <>
      <rect x="19" y="4" width="10" height="5" rx="1.5" fill="#15803D" />
      <rect x="12" y="8" width="24" height="34" rx="5" fill="#16A34A" />
      <path d="M26.5 15 19 27h5.5l-3 9.5L30 24h-5.5l2-9z" fill="#fff" />
    </>
  ),
  ecommerce: (
    <>
      <path d="M17 19v-4a7 7 0 0 1 14 0v4" fill="none" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
      <rect x="9" y="18" width="30" height="25" rx="5" fill="#FBBF24" />
      <circle cx="19" cy="27" r="1.8" fill="#78350F" />
      <circle cx="29" cy="27" r="1.8" fill="#78350F" />
      <path d="M19 33q5 4.5 10 0" fill="none" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  truck: (
    <>
      <rect x="4" y="13" width="40" height="21" rx="4" fill="#0EA5E9" />
      <rect x="30" y="18" width="8" height="4" rx="1" fill="#fff" />
      <circle cx="13" cy="36" r="4.5" fill="#0F172A" />
      <circle cx="35" cy="36" r="4.5" fill="#0F172A" />
    </>
  ),
  telemetry: (
    <>
      <rect x="10" y="21" width="6" height="16" rx="1.5" fill="#A78BFA" />
      <rect x="21" y="11" width="6" height="26" rx="1.5" fill="#8B5CF6" />
      <rect x="32" y="17" width="6" height="20" rx="1.5" fill="#A78BFA" />
      <circle cx="13" cy="16" r="2" fill="#8B5CF6" />
      <circle cx="35" cy="12" r="2" fill="#8B5CF6" />
      <rect x="7" y="39" width="34" height="3" rx="1.5" fill="#6D28D9" />
    </>
  ),
  healthcare: (
    <>
      <circle cx="24" cy="24" r="19" fill="#EF4444" />
      <rect x="20" y="12" width="8" height="24" rx="2" fill="#fff" />
      <rect x="12" y="20" width="24" height="8" rx="2" fill="#fff" />
    </>
  ),
  car: (
    <>
      <path d="M13 15h22l5 9H8z" fill="#60A5FA" />
      <path d="M5 24h38v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="#1D8CF8" />
      <rect x="9" y="26" width="30" height="3" rx="1.5" fill="#1565C0" />
      <circle cx="14" cy="36" r="4.5" fill="#0F172A" />
      <circle cx="34" cy="36" r="4.5" fill="#0F172A" />
    </>
  ),
  it: (
    <>
      <rect x="5" y="8" width="38" height="26" rx="3" fill="#475569" />
      <rect x="9" y="12" width="30" height="18" rx="1.5" fill="#CBD5E1" />
      <rect x="20" y="17" width="8" height="8" rx="1" fill="#475569" />
      <rect x="21" y="34" width="6" height="5" fill="#475569" />
      <rect x="14" y="39" width="20" height="3" rx="1.5" fill="#475569" />
    </>
  )
};

/* =========================================================
   INDUSTRY DATA
========================================================= */

const industries = [
  {
    name: 'Manufacturing',
    icon: 'manufacturing',
    ring: '#22B8CF',
    image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>Manufacturing is rapidly evolving toward <strong>smart factories powered by Industry 4.0 principles.</strong></>,
      <>The global industrial analytics market is projected to exceed <strong>$100B by 2030.</strong></>,
      <>Agentic AI plays a key role in predictive maintenance, <strong>yield optimization, quality control, and energy efficiency.</strong></>,
      <>The urgency to adopt analytics is high, as manufacturers seek automation, cost reduction, and data-driven decision-making.</>
    ],
    companies: [
      ['Reliance Industries', 'ril.com'],
      ['Tata Steel', 'tatasteel.com'],
      ['Aditya Birla Group', 'adityabirla.com'],
      ['Hindustan Unilever', 'hul.co.in'],
      ['ITC Limited', 'itcportal.com'],
      ['JSW Group', 'jsw.in'],
      ['Bosch India', 'bosch.in'],
      ['Siemens India', 'siemens.com'],
      ['Godrej Group', 'godrej.com'],
      ['Larsen & Toubro', 'larsentoubro.com']
    ]
  },
  {
    name: 'Telecommunication',
    icon: 'telecom',
    ring: '#12A594',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>Telecommunication provides large-scale connectivity and data services, generating massive volumes of network data.</>,
      <>The telecom analytics market is expected to exceed <strong>$20B by 2028, fueled by 5G and real-time services.</strong></>,
      <>Agentic AI enables <strong>network optimization, churn prediction, fault detection, and self-healing systems.</strong></>,
      <>Analytics expertise is urgently required to build intelligent, autonomous, and customer-centric networks.</>
    ],
    companies: [
      ['Reliance Jio', 'jio.com'],
      ['Bharti Airtel', 'airtel.in'],
      ['Vodafone Idea (VI)', 'myvi.in'],
      ['BSNL', 'bsnl.co.in'],
      ['MTNL', 'mtnl.in'],
      ['Tata Communications', 'tatacommunications.com'],
      ['RailTel', 'railtel.in'],
      ['Indus Towers', 'industowers.com']
    ]
  },
  {
    name: 'EV & Battery',
    icon: 'battery',
    ring: '#B7795C',
    image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>The EV and battery sector is central to the global transition toward sustainable mobility and energy storage.</>,
      <>The EV analytics and AI market is projected to exceed <strong>$50B by 2030.</strong></>,
      <>Agentic AI is used for <strong>battery health prediction, charging optimization, lifecycle management, and fleet intelligence.</strong></>,
      <>There is a fast-growing demand for data analytics experts who can power innovation, safety, and scalability in clean energy systems.</>
    ],
    companies: [
      ['Tata Power (EV Solutions)', 'tatapower.com'],
      ['Ather Energy', 'atherenergy.com'],
      ['Ola Electric', 'olaelectric.com'],
      ['Hero Electric', 'heroelectric.in'],
      ['TVS Electric', 'tvsmotor.com']
    ]
  },
  {
    name: 'E-commerce',
    icon: 'ecommerce',
    ring: '#F4511E',
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>E-commerce is a highly data-driven sector focused on digital buying, selling, and fulfillment at massive scale, projected to cross <strong>$200B by 2027.</strong></>,
      <>Companies are aggressively adopting Agentic AI for personalization, demand forecasting, pricing optimization, and autonomous customer engagement.</>,
      <>The demand for data analytics and AI experts is accelerating as businesses compete on <strong>customer experience, real-time insights, and operational efficiency.</strong></>,
      <>This is a high-urgency domain where data intelligence directly translates into revenue growth and competitive advantage.</>
    ],
    companies: [
      ['Flipkart', 'flipkart.com'],
      ['Amazon India', 'amazon.in'],
      ['Myntra', 'myntra.com'],
      ['Nykaa', 'nykaa.com'],
      ['BigBasket', 'bigbasket.com'],
      ['AJIO', 'ajio.com'],
      ['Zomato', 'zomato.com'],
      ['Swiggy', 'swiggy.com'],
      ['ShopClues', 'shopclues.com'],
      ['Paytm Mall', 'paytm.com']
    ]
  },
  {
    name: 'Supply Chain',
    icon: 'truck',
    ring: '#D6307F',
    image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>Supply chain operations manage complex networks of suppliers, logistics, and distribution, making analytics mission-critical.</>,
      <>The global supply chain analytics market is expected to exceed <strong>$30B by 2030.</strong></>,
      <>Agentic AI enables autonomous routing, inventory optimization, and disruption prediction.</>,
      <>There is a strong and growing need for analytics professionals who can reduce costs, improve service levels, and build intelligent, self-optimizing logistics ecosystems.</>
    ],
    companies: [
      ['Blue Dart Express', 'bluedart.com'],
      ['GATI Ltd', 'gati.com'],
      ['Safexpress', 'safexpress.com'],
      ['TCI', 'tcil.com'],
      ['Ecom Express', 'ecomexpress.in'],
      ['DTDC', 'dtdc.com'],
      ['VRL Logistics', 'vrlgroup.in'],
      ['Allcargo Logistics', 'allcargologistics.com'],
      ['Delhivery', 'delhivery.com'],
      ['XpressBees', 'xpressbees.com']
    ]
  },
  {
    name: 'Telemetry',
    icon: 'telemetry',
    ring: '#B04AA8',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>Telemetry focuses on real-time data collection from <strong>sensors, devices, and machines across IoT-driven environments.</strong></>,
      <>With over <strong>25B connected devices expected by 2030</strong>, telemetry analytics is becoming a backbone of modern systems.</>,
      <>Agentic AI is essential for <strong>anomaly detection, predictive alerts, and autonomous response systems.</strong></>,
      <>The scope for data analytics experts is vast, as real-time intelligence and automation are now business-critical rather than optional.</>
    ],
    companies: [
      ['Trimble', 'trimble.com'],
      ['Geotab', 'geotab.com'],
      ['Samsara', 'samsara.com'],
      ['Bosch', 'bosch.com'],
      ['Continental', 'continental.com']
    ]
  },
  {
    name: 'Healthcare',
    icon: 'healthcare',
    ring: '#6366F1',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>Healthcare combines <strong>clinical, operational, and patient data</strong> to improve outcomes and system efficiency.</>,
      <>The healthcare analytics market is projected to surpass <strong>$50B by 2028</strong> due to digital health and predictive care adoption.</>,
      <>Agentic AI supports diagnostics, patient monitoring, workflow automation, and personalized treatment paths.</>,
      <>There is an urgent need for skilled analytics professionals who can apply AI responsibly to <strong>save lives, reduce costs, and enhance care delivery.</strong></>
    ],
    companies: [
      ['Apollo Hospitals', 'apollohospitals.com'],
      ['Fortis Healthcare', 'fortishealthcare.com'],
      ['Max Healthcare', 'maxhealthcare.in'],
      ['Narayana Health', 'narayanahealth.org'],
      ['Manipal Hospitals', 'manipalhospitals.com'],
      ['Medanta', 'medanta.org'],
      ['Aster DM Healthcare', 'asterhospitals.in'],
      ['Care Hospitals', 'carehospitals.com'],
      ['Columbia Asia', 'columbiaasia.com'],
      ['Cloudnine Hospitals', 'cloudninecare.com']
    ]
  },
  {
    name: 'Automobile',
    icon: 'car',
    ring: '#1E88E5',
    image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>The automobile sector spans <strong>manufacturing, connected vehicles, and emerging mobility services.</strong></>,
      <>Automotive analytics is expected to reach <strong>$40B+ by 2030</strong>, driven by electric, connected, and autonomous vehicles.</>,
      <>Agentic AI enables <strong>predictive maintenance, quality analytics, and intelligent production planning.</strong></>,
      <>Data analytics expertise is in high demand to support smart mobility, safety, and next-generation vehicle intelligence.</>
    ],
    companies: [
      ['Tata Motors', 'tatamotors.com'],
      ['Maruti Suzuki India', 'marutisuzuki.com'],
      ['Mahindra & Mahindra', 'mahindra.com'],
      ['Hero MotoCorp', 'heromotocorp.com'],
      ['Bajaj Auto', 'bajajauto.com'],
      ['TVS Motor Company', 'tvsmotor.com'],
      ['Ashok Leyland', 'ashokleyland.com'],
      ['Eicher Motors', 'eichermotors.com'],
      ['Toyota Kirloskar', 'toyotabharat.com'],
      ['Honda Cars India', 'hondacarindia.com']
    ]
  },
  {
    name: 'IT Services',
    icon: 'it',
    ring: '#29B6F6',
    image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=640&q=65&fm=webp',
    points: [
      <>IT services organizations drive digital transformation across industries using technology and data. AI and analytics services are growing at over <strong>20% CAGR</strong>, becoming core revenue drivers for IT firms.</>,
      <>Agentic AI automates DevOps, service delivery, security operations, and intelligent client solutions.</>,
      <>There is massive scope and demand for analytics professionals who can design, deploy, and scale AI-driven services.</>
    ],
    companies: [
      ['Tata Consultancy Services (TCS)', 'tcs.com'],
      ['Infosys', 'infosys.com'],
      ['Wipro', 'wipro.com'],
      ['HCL Technologies', 'hcltech.com'],
      ['Tech Mahindra', 'techmahindra.com'],
      ['LTIMindtree', 'ltimindtree.com'],
      ['Mphasis', 'mphasis.com'],
      ['Coforge', 'coforge.com'],
      ['Persistent Systems', 'persistent.com'],
      ['Hexaware Technologies', 'hexaware.com']
    ]
  }
];

/* =========================================================
   ORBIT GEOMETRY
========================================================= */

const VB = 700;
const C = VB / 2;
const RING = 205;
const INNER = 130;
const LABEL = 292;
const SPOKE_FROM = 58;
const SPOKE_TO = RING - 38;
const STEP = 360 / industries.length;
const START = -100;

const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

const pct = (v) => `${(v / VB) * 100}%`;

const nodes = industries.map((ind, i) => ({
  ...ind,
  angle: START + i * STEP
}));

function arc(r, from, to) {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

/* =========================================================
   COMPANY LOGOS
========================================================= */

const COMPANY_LOGOS = {
  'Reliance Industries': 'relianceindustries',
  'Tata Steel': 'tatasteel',
  'Aditya Birla Group': 'adityabirlagroup',
  'Hindustan Unilever': 'unilever',
  'ITC Limited': 'itc',
  'JSW Group': 'jsw',
  'Bosch India': 'bosch',
  'Siemens India': 'siemens',
  'Godrej Group': 'godrej',
  'Larsen & Toubro': 'larsentoubro',
  'Reliance Jio': 'jio',
  'Bharti Airtel': 'airtel',
  'Vodafone Idea (VI)': 'vodafone',
  'BSNL': 'bsnl',
  'MTNL': 'mtnl',
  'Tata Communications': 'tatacommunications',
  'RailTel': 'railtel',
  'Indus Towers': 'industowers',
  'Tata Power (EV Solutions)': 'tatapower',
  'Ather Energy': 'ather',
  'Ola Electric': 'ola',
  'Hero Electric': 'heromotocorp',
  'TVS Electric': 'tvsmotor',
  'Flipkart': 'flipkart',
  'Amazon India': 'amazon',
  'Myntra': 'myntra',
  'Nykaa': 'nykaa',
  'BigBasket': 'bigbasket',
  'AJIO': 'ajio',
  'Zomato': 'zomato',
  'Swiggy': 'swiggy',
  'ShopClues': 'shopclues',
  'Paytm Mall': 'paytm',
  'Blue Dart Express': 'bluedart',
  'GATI Ltd': 'gati',
  'Safexpress': 'safexpress',
  'TCI': 'tci',
  'Ecom Express': 'ecomexpress',
  'DTDC': 'dtdc',
  'VRL Logistics': 'vrl',
  'Allcargo Logistics': 'allcargo',
  'Delhivery': 'delhivery',
  'XpressBees': 'xpressbees',
  'Trimble': 'trimble',
  'Geotab': 'geotab',
  'Samsara': 'samsara',
  'Bosch': 'bosch',
  'Continental': 'continental',
  'Apollo Hospitals': 'apollo',
  'Fortis Healthcare': 'fortis',
  'Max Healthcare': 'maxhealthcare',
  'Narayana Health': 'narayanahealth',
  'Manipal Hospitals': 'manipalhospitals',
  'Medanta': 'medanta',
  'Aster DM Healthcare': 'aster',
  'Care Hospitals': 'care',
  'Columbia Asia': 'columbiaasia',
  'Cloudnine Hospitals': 'cloudnine',
  'Tata Motors': 'tatamotors',
  'Maruti Suzuki India': 'suzuki',
  'Mahindra & Mahindra': 'mahindra',
  'Hero MotoCorp': 'heromotocorp',
  'Bajaj Auto': 'bajaj',
  'TVS Motor Company': 'tvsmotor',
  'Ashok Leyland': 'ashokleyland',
  'Eicher Motors': 'eicher',
  'Toyota Kirloskar': 'toyota',
  'Honda Cars India': 'honda',
  'Tata Consultancy Services (TCS)': 'tcs',
  'Infosys': 'infosys',
  'Wipro': 'wipro',
  'HCL Technologies': 'hcl',
  'Tech Mahindra': 'techmahindra',
  'LTIMindtree': 'ltimindtree',
  'Mphasis': 'mphasis',
  'Coforge': 'coforge',
  'Persistent Systems': 'persistent',
  'Hexaware Technologies': 'hexaware'
};

/*
  Optional exact-logo override.
  Add verified SVG/PNG files to public/company-logos and map them here.
*/
const LOCAL_COMPANY_LOGOS = {
  // 'Infosys': '/company-logos/infosys.svg',
  // 'TCS': '/company-logos/tcs.svg',
};

/* =========================================================
   COMPANY CARD
   1. Local SVG
   2. Website favicon fallback
   3. Company initials
========================================================= */

function getInitials(name) {
  const clean = name.replace(/\(.*?\)/g, '').replace(/&/g, ' ').trim();
  const words = clean.split(/\s+/);

  return words.length === 1
    ? words[0].slice(0, 4).toUpperCase()
    : words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function CompanyCard({ company, index }) {
  const [name, websiteDomain] = company;

  const [logoStage, setLogoStage] = useState('local');

  const brandSlug = COMPANY_LOGOS[name];

  const localLogo = LOCAL_COMPANY_LOGOS[name] ||
    (brandSlug ? `/company-logos/${brandSlug}.svg` : null);

  const faviconUrl = websiteDomain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(websiteDomain)}&sz=128`
    : null;

  const logoUrl =
    logoStage === 'local'
      ? localLogo
      : logoStage === 'favicon'
        ? faviconUrl
        : null;

  const handleLogoError = () => {
    if (logoStage === 'local' && faviconUrl) {
      setLogoStage('favicon');
    } else {
      setLogoStage('fallback');
    }
  };

  return (
    <div
      className="aa-industry-company"
      style={{ '--company-index': index }}
    >
      <div className="aa-industry-company__logo">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${name} logo`}
            loading="eager"
            decoding="async"
            onError={handleLogoError}
          />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>

      <span className="aa-industry-company__name">
        {name}
      </span>
    </div>
  );
}

/* =========================================================
   INDUSTRY MODAL
========================================================= */

function IndustryModal({ industry, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      className="aa-industry-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="aa-industry-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${industry.name} industry details`}
      >
        {/* LEFT PANEL */}

        <aside className="aa-industry-sidebar">
          <div className="aa-industry-sidebar__header">
            <span>INDUSTRY DOMAIN</span>

            <button
              type="button"
              className="aa-industry-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={22} strokeWidth={1.7} />
            </button>
          </div>

          <div className="aa-industry-sidebar__content">
            <h2>{industry.name}</h2>

            <div className="aa-industry-banner">
              <img
                src={industry.image}
                alt={`${industry.name} industry`}
                loading="eager"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            </div>

            <ul className="aa-industry-points">
              {industry.points.map((point, index) => (
                <li key={index}>
                  <CheckCircle2
                    className="aa-industry-check"
                    size={13}
                    fill="#159447"
                    color="#159447"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* RIGHT PANEL */}

        <main className="aa-industry-main">
          <div className="aa-industry-main__heading">
            <h2>
              Scope of AI in <span>{industry.name}</span>
            </h2>

            <p>COMPANIES ACTIVELY HIRING</p>
          </div>

          <div className="aa-industry-companies">
            {industry.companies.map((company, index) => (
              <CompanyCard
                key={company[0]}
                company={company}
                index={index}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN MASTER AI SECTION
========================================================= */

export default function MasterAISection() {
  const [active, setActive] = useState(null);

  return (
    <>
      {/* MODAL CSS */}

      <style>{`

        .aa-industry-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 15px;
          background: rgba(8, 15, 30, 0.70);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          animation: aaIndustryFadeIn .22s ease;
        }

        .aa-industry-modal {
          width: 100%;
          max-width: 1500px;
          height: 90vh;
          max-height: 900px;
          min-height: 480px;
          display: grid;
          grid-template-columns: 34% 66%;
          background: #fff;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 25px 80px rgba(0,0,0,.25);
          animation: aaIndustryModalIn .28s ease;
        }

        .aa-industry-sidebar {
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: #fff;
          border-right: 1px solid #e4eaf2;
          overflow-y: auto;
        }

        .aa-industry-sidebar__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 25px 12px;
          flex-shrink: 0;
        }

        .aa-industry-sidebar__header > span {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #647894;
        }

        .aa-industry-close {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          border-radius: 50%;
          transition: all .2s ease;
        }

        .aa-industry-close:hover {
          background: #f1f5f9;
          color: #111827;
          transform: rotate(90deg);
        }

        .aa-industry-sidebar__content {
          padding: 22px 25px 28px;
        }

        .aa-industry-sidebar__content h2 {
          margin: 0 0 17px;
          font-size: clamp(22px, 2vw, 28px);
          line-height: 1.25;
          font-weight: 800;
          letter-spacing: -.7px;
          color: #111827;
        }

        .aa-industry-banner {
          width: 100%;
          height: 190px;
          overflow: hidden;
          border-radius: 11px;
          background: #f1f5f9;
          margin-bottom: 17px;
        }

        .aa-industry-banner img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .aa-industry-points {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 0;
          margin: 0;
          list-style: none;
        }

        .aa-industry-points li {
          display: grid;
          grid-template-columns: 12px minmax(0,1fr);
          gap: 9px;
          align-items: start;
          color: #171717;
          font-size: 13px;
          line-height: 1.65;
        }

        .aa-industry-points li strong {
          font-weight: 750;
        }

        .aa-industry-check {
          margin-top: 4px;
          flex-shrink: 0;
          stroke: #fff;
          stroke-width: 3;
        }

        .aa-industry-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          padding: 32px 30px 25px;
          overflow-y: auto;
          background: #fff;
        }

        .aa-industry-main__heading {
          text-align: center;
          flex-shrink: 0;
          margin-bottom: 38px;
        }

        .aa-industry-main__heading h2 {
          margin: 0;
          color: #1e293b;
          font-size: clamp(22px, 2.1vw, 29px);
          font-weight: 750;
          line-height: 1.3;
          letter-spacing: -.6px;
        }

        .aa-industry-main__heading h2 span {
          color: #2563eb;
        }

        .aa-industry-main__heading p {
          margin: 17px 0 0;
          color: #52627a;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.1px;
        }

        .aa-industry-companies {
          display: grid;
          grid-template-columns: repeat(4,minmax(0,1fr));
          gap: 17px 15px;
          align-content: start;
        }

        .aa-industry-company {
          min-width: 0;
          min-height: 175px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 11px;
          padding: 16px 9px 13px;
          background: #fff;
          border: 1px solid #dce5f0;
          border-bottom: 4px solid #087bff;
          border-radius: 17px;
          box-shadow: 0 5px 12px rgba(30,64,120,.055);
          text-align: center;
          transition: transform .22s ease, box-shadow .22s ease;
          animation: aaCompanyIn .35s ease both;
          animation-delay: calc(var(--company-index) * .035s);
        }

        .aa-industry-company:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 22px rgba(30,64,120,.12);
        }

        .aa-industry-company__logo {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.aa-industry-company__logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: auto;
  display: block;
}

        .aa-industry-company__logo span {
          color: #263c68;
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -.5px;
        }

        .aa-industry-company__name {
          max-width: 100%;
          color: #263449;
          font-size: 10px;
          font-weight: 750;
          line-height: 1.45;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }

        @keyframes aaIndustryFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes aaIndustryModalIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes aaCompanyIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (min-width: 1500px) {
          .aa-industry-modal {
            max-width: 1600px;
          }

          .aa-industry-company {
            min-height: 185px;
          }
        }

        @media (max-width: 1050px) {
          .aa-industry-modal {
            height: 92vh;
            grid-template-columns: 36% 64%;
          }

          .aa-industry-main {
            padding: 25px 18px;
          }

          .aa-industry-companies {
            grid-template-columns: repeat(3,minmax(0,1fr));
            gap: 12px;
          }

          .aa-industry-company {
            min-height: 150px;
          }

          .aa-industry-company__logo {
            width: 65px;
            height: 65px;
          }

          .aa-industry-banner {
            height: 160px;
          }

          .aa-industry-sidebar__content {
            padding: 20px;
          }
        }

        @media (max-width: 650px) {
          .aa-industry-overlay {
            padding: 0;
            align-items: stretch;
          }

          .aa-industry-modal {
            width: 100%;
            height: 100dvh;
            max-height: none;
            min-height: 0;
            border-radius: 0;
            grid-template-columns: 1fr;
            grid-template-rows: auto 1fr;
            overflow-y: auto;
          }

          .aa-industry-sidebar {
            overflow: visible;
            border-right: none;
            border-bottom: 1px solid #e4eaf2;
          }

          .aa-industry-sidebar__header {
            padding: 13px 18px 5px;
          }

          .aa-industry-sidebar__content {
            padding: 8px 18px 18px;
          }

          .aa-industry-sidebar__content h2 {
            font-size: 22px;
            margin-bottom: 12px;
          }

          .aa-industry-banner {
            height: 170px;
          }

          .aa-industry-points {
            gap: 8px;
          }

          .aa-industry-points li {
            font-size: 12px;
            line-height: 1.55;
          }

          .aa-industry-main {
            overflow: visible;
            padding: 22px 16px 30px;
          }

          .aa-industry-main__heading {
            margin-bottom: 22px;
          }

          .aa-industry-main__heading h2 {
            font-size: 21px;
          }

          .aa-industry-main__heading p {
            margin-top: 10px;
            font-size: 10px;
          }

          .aa-industry-companies {
            grid-template-columns: repeat(2,minmax(0,1fr));
            gap: 12px;
          }

          .aa-industry-company {
            min-height: 135px;
            border-radius: 13px;
            gap: 8px;
          }

          .aa-industry-company__logo {
            width: 62px;
            height: 62px;
          }

          .aa-industry-company__name {
            font-size: 9px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .aa-industry-overlay,
          .aa-industry-modal,
          .aa-industry-company {
            animation: none;
          }
        }

      `}</style>

      {/* EXISTING MASTER AI SECTION */}

      <section className="aa-master">
        <div className="aa-container">

          <h2 className="aa-h2">
            Mastering AI Multiplies <br />
            <span>Your Opportunities</span>
          </h2>

          <p className="aa-sub">
            AI is transforming the world and every industry is investing heavily in it. Not just to grow
            revenue, but to eliminate manual work, generate accurate insights, and drive predictable
            business outcomes
          </p>

          <p className="aa-master__hint">
            <MousePointerClick size={16} />
            Click on the icon to view hiring companies
          </p>

          <div className="aa-orbit">

            <svg
              className="aa-orbit__svg"
              viewBox={`0 0 ${VB} ${VB}`}
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="aa-orbit-disc" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#F4EFE6" />
                  <stop offset="70%" stopColor="#FAF7F1" />
                  <stop offset="100%" stopColor="#FDFBF7" />
                </radialGradient>
              </defs>

              <circle
                cx={C}
                cy={C}
                r={RING}
                fill="url(#aa-orbit-disc)"
              />

              {nodes.map((n) => (
                <path
                  key={`arc-${n.name}`}
                  d={arc(
                    RING,
                    n.angle - STEP / 2,
                    n.angle + STEP / 2
                  )}
                  className="aa-orbit__arc"
                  stroke={n.ring}
                />
              ))}

              <circle
                cx={C}
                cy={C}
                r={INNER}
                className="aa-orbit__inner"
              />

              {nodes.map((n, i) => {
                const [x1, y1] = polar(SPOKE_FROM, n.angle);
                const [x2, y2] = polar(SPOKE_TO, n.angle);

                return (
                  <g key={`spoke-${n.name}`}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className="aa-orbit__spoke"
                    />

                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className="aa-orbit__pulse"
                      style={{
                        animationDelay: `${(i * 0.37) % 2.4}s`
                      }}
                    />
                  </g>
                );
              })}
            </svg>

            <div className="aa-orbit__chip">
              <Cpu strokeWidth={1.8} />
            </div>

            {nodes.map((n) => {
              const [x, y] = polar(RING, n.angle);
              const [lx, ly] = polar(LABEL, n.angle);

              return (
                <div key={n.name}>
                  <button
                    type="button"
                    className="aa-orbit__node"
                    style={{
                      left: pct(x),
                      top: pct(y),
                      '--node': n.ring
                    }}
                    onClick={() => setActive(n)}
                    aria-label={`${n.name} — view hiring companies`}
                    title={`Explore ${n.name}`}
                  >
                    <svg viewBox="0 0 48 48" aria-hidden="true">
                      {icons[n.icon]}
                    </svg>
                  </button>

                  <span
                    className="aa-orbit__label"
                    style={{
                      left: pct(lx),
                      top: pct(ly)
                    }}
                    aria-hidden="true"
                  >
                    {n.name}
                  </span>
                </div>
              );
            })}

          </div>
        </div>
      </section>

      {/* FULL SCREEN POPUP */}

      {active && (
        <IndustryModal
          industry={active}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}