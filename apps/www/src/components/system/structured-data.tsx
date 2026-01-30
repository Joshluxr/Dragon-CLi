import Script from "next/script";

export function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Terragon",
    applicationCategory: "DeveloperApplication",
    description:
      "AI-powered coding assistant platform that allows you to run coding agents in parallel inside remote sandboxes",
    url: "https://www.terragonlabs.com",
    creator: {
      "@type": "Organization",
      name: "Terragon Labs",
      url: "https://www.terragonlabs.com",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    operatingSystem: "Web",
    featureList: [
      "Parallel coding agents",
      "Remote sandboxes",
      "Claude Code integration",
      "Automated testing",
      "Git integration",
      "Real-time collaboration",
    ],
    softwareRequirements: "Modern web browser with JavaScript enabled",
  };

  const organizationData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Terragon Labs",
    url: "https://www.terragonlabs.com",
    logo: "https://www.terragonlabs.com/favicon.png",
  };

  const websiteData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Terragon",
    url: "https://www.terragonlabs.com",
  };

  return (
    <>
      <Script
        id="structured-data-software"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <Script
        id="structured-data-organization"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationData),
        }}
      />
      <Script
        id="structured-data-website"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteData),
        }}
      />
    </>
  );
}
