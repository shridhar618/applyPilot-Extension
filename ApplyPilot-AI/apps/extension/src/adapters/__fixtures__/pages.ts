// Hand-written fixtures modelled on the public markup of each site. They are NOT captures of live pages; real sites change,
// which is exactly why extraction has fallbacks and a manual-entry path.
const LONG = "We are hiring a Data Engineer to build reliable pipelines. ".repeat(6);

export const JSONLD_PAGE = `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "JobPosting", title: "Data Engineer Intern",
  hiringOrganization: { "@type": "Organization", name: "Acme Analytics" },
  jobLocation: { "@type": "Place", address: { addressLocality: "Bengaluru", addressRegion: "KA", addressCountry: "IN" } },
  employmentType: ["INTERN", "FULL_TIME"],
  baseSalary: { currency: "INR", value: { minValue: 30000, maxValue: 40000, unitText: "MONTH" } },
  description: `<p>${LONG}</p><h3>Requirements</h3><ul><li>Python and SQL</li><li>1+ years of experience</li></ul><h3>Nice to have</h3><ul><li>Kafka</li></ul>`,
})}</script></head><body><h1>Ignored when JSON-LD exists</h1></body></html>`;

export const JSONLD_GRAPH_ENCODED = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@graph": [{ "@type": "WebSite" }, { "@type": ["JobPosting"], title: "ML Engineer", hiringOrganization: "Beta AI", jobLocationType: "TELECOMMUTE",
    description: `&lt;p&gt;${LONG}&lt;/p&gt;&lt;ul&gt;&lt;li&gt;PyTorch&lt;/li&gt;&lt;/ul&gt;` }],
})}</script></head><body></body></html>`;

export const BROKEN_JSONLD_THEN_GREENHOUSE = `<html><head><title>Job Application for Backend Engineer at Gamma Corp</title>
<script type="application/ld+json">{ this is not json </script></head><body>
<h1 class="app-title">Backend Engineer</h1><div class="location">Remote - India</div>
<div id="content"><p>${LONG}</p><h3>Requirements</h3><ul><li>Python</li><li>PostgreSQL</li></ul><h3>Preferred</h3><ul><li>Docker</li></ul></div></body></html>`;

export const LEVER_PAGE = `<html><head><title>Delta - Platform Engineer</title></head><body>
<div class="main-header-logo"><img alt="Delta logo"></div>
<div class="posting-headline"><h2>Platform Engineer</h2><div class="posting-categories"><span class="location">Bangalore</span><span class="commitment">Full-time /</span></div></div>
<div class="section-wrapper"><div class="section"><p>${LONG}</p></div><div class="section"><h3>Requirements</h3><ul><li>Kubernetes</li><li>Terraform</li></ul></div></div></body></html>`;

export const GENERIC_PAGE = `<html><head><title>Careers | Epsilon</title><meta property="og:site_name" content="Epsilon Labs"></head><body>
<nav>Home About Careers Blog Contact us today for all your widget needs and more navigation text here</nav>
<main><h1>Frontend Developer</h1><div><p>${LONG}</p><h2>Responsibilities</h2><ul><li>Build React UIs</li></ul><h2>Requirements</h2><ul><li>JavaScript, TypeScript</li><li>React</li></ul></div></main>
<footer>Copyright Epsilon</footer></body></html>`;

export const NOT_A_JOB_PAGE = `<html><head><title>Blog</title></head><body><main><h1>Ten tips for gardening</h1><p>${"Water your plants regularly. ".repeat(20)}</p></main></body></html>`;
export const TINY_PAGE = `<html><body><h1>Job</h1><p>Short.</p></body></html>`;
