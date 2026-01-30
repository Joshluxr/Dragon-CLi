import Script from "next/script";

export function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dragon",
    applicationCategory: "DeveloperApplication",
    description:
      "AI-powered coding assistant platform that allows you to run coding agents in parallel inside remote sandboxes",
    url: "https://dragon-labz.vercel.app",
    creator: {
      "@type": "Organization",
      name: "Dragon Labs",
      url: "https://dragon-labz.vercel.app",
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
    name: "Dragon Labs",
    url: "https://dragon-labz.vercel.app",
    logo: "https://dragon-labz.vercel.app/favicon.png",
  };

  const websiteData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Dragon",
    url: "https://dragon-labz.vercel.app",
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
