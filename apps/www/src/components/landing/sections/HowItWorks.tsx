function StepBox({
  number,
  label,
  heading,
  description,
  className,
  visual,
}: {
  number: string;
  label: string;
  heading: string;
  description: React.ReactNode;
  className?: string;
  visual?: React.ReactNode;
}) {
  return (
    <div
      className={`p-4 sm:p-6 overflow-hidden relative border-r border-b border-border/30 ${className || ""}`}
    >
      <div className="relative z-10 space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="size-3.5 flex items-center justify-center font-bold">
            {number}
          </span>
          <span>{label}</span>
        </div>

        <div className="text-base sm:text-lg inline-block">
          <h3 className="font-bold inline">{heading}</h3>
          <div className="text-muted-foreground">{description}</div>
        </div>
        {visual}
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="container mx-auto px-4 max-w-3xl pt-24 pb-8"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="text-center space-y-3 mb-8">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
            How It Works
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Go from task to pull request in no time at all
          </p>
        </div>

        <div className="grid grid-cols-1 gap-0 border-l border-t border-border/30">
          <StepBox
            number="1"
            label="Prompt"
            heading="Describe your task"
            description="Select your GitHub repo and describe your task"
          />
          <StepBox
            number="2"
            label="Do something else"
            heading="Agent works on your task"
            description="Your repo is cloned to a cloud sandbox and an agent starts working on your task"
          />
          <StepBox
            number="3"
            label="Pull Request"
            heading="Review & Merge"
            description="Once the agent is done, it automatically opens a pull request for you to review"
          />
        </div>
      </div>
    </section>
  );
}
