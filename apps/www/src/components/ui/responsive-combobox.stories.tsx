import type { Story, StoryDefault } from "@ladle/react";
import { ResponsiveCombobox } from "./responsive-combobox";
import { useState } from "react";
import { Mail, Globe } from "lucide-react";

export default {
  title: "UI/ResponsiveCombobox",
} satisfies StoryDefault;

const sampleItems = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
  { value: "date", label: "Date" },
  { value: "elderberry", label: "Elderberry" },
  { value: "fig", label: "Fig" },
  { value: "grape", label: "Grape" },
  { value: "honeydew", label: "Honeydew" },
];

export const Basic: Story = () => {
  const [value, setValue] = useState<string | null>(null);

  return (
    <div className="p-8">
      <ResponsiveCombobox
        icon={<Mail className="size-4" />}
        items={sampleItems}
        value={value}
        setValue={setValue}
        disabled={false}
        placeholder="Select a fruit"
        searchPlaceholder="Search fruits..."
        emptyText="No fruits found."
      />
      <div className="mt-4 text-sm text-muted-foreground">
        Selected value: {value || "None"}
      </div>
    </div>
  );
};

// Mock data for simulating API responses
const allCountries = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "mx", label: "Mexico" },
  { value: "gb", label: "United Kingdom" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "it", label: "Italy" },
  { value: "es", label: "Spain" },
  { value: "pt", label: "Portugal" },
  { value: "nl", label: "Netherlands" },
  { value: "be", label: "Belgium" },
  { value: "ch", label: "Switzerland" },
  { value: "at", label: "Austria" },
  { value: "se", label: "Sweden" },
  { value: "no", label: "Norway" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "pl", label: "Poland" },
  { value: "cz", label: "Czech Republic" },
  { value: "hu", label: "Hungary" },
  { value: "ro", label: "Romania" },
  { value: "bg", label: "Bulgaria" },
  { value: "gr", label: "Greece" },
  { value: "tr", label: "Turkey" },
  { value: "jp", label: "Japan" },
  { value: "cn", label: "China" },
  { value: "kr", label: "South Korea" },
  { value: "in", label: "India" },
  { value: "au", label: "Australia" },
  { value: "nz", label: "New Zealand" },
  { value: "br", label: "Brazil" },
  { value: "ar", label: "Argentina" },
  { value: "cl", label: "Chile" },
  { value: "co", label: "Colombia" },
  { value: "pe", label: "Peru" },
];

// Simulate API delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const Dynamic: Story = () => {
  const [value, setValue] = useState<string | null>(null);
  const [items, setItems] = useState<typeof allCountries>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadCountries = async () => {
    setIsLoading(true);
    await delay(1000); // Simulate network delay
    setItems(allCountries);
    setIsLoading(false);
  };

  return (
    <div className="p-8">
      <div className="mb-4 text-sm text-muted-foreground">
        This combobox loads all countries when opened for the first time. The
        loading only happens once.
      </div>
      <ResponsiveCombobox
        icon={<Globe className="size-4" />}
        items={items}
        value={value}
        setValue={setValue}
        disabled={false}
        placeholder="Select a country"
        searchPlaceholder="Search countries..."
        emptyText={
          items.length === 0 && !isLoading
            ? "Click to load countries"
            : "No countries found"
        }
        onLoadItems={loadCountries}
        isLoading={isLoading}
        loadingText="Loading countries..."
      />
      <div className="mt-4 text-sm text-muted-foreground">
        Selected value: {value || "None"}
      </div>
    </div>
  );
};
