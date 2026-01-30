"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

const faqs = [
  {
    question: "What is Terragon?",
    answer:
      "Terragon is an AI-powered coding assistant platform that allows you to run coding agents in parallel inside remote sandboxes. This enables you to work on multiple tasks concurrently and asynchronously, with agents that can make edits, run tests, verify changes, and create commits and PRs.",
  },
  {
    question: "Which coding agents does Terragon support?",
    answer: (
      <>
        Terragon supports{" "}
        <a
          target="_blank"
          className="underline"
          href="https://www.anthropic.com/products/claude-code"
        >
          Claude Code
        </a>
        ,{" "}
        <a
          target="_blank"
          className="underline"
          href="https://openai.com/codex/"
        >
          OpenAI Codex
        </a>
        , and{" "}
        <a target="_blank" className="underline" href="https://ampcode.com/">
          Amp
        </a>
        . If you want to see a new agent supported, please let us know!
      </>
    ),
  },
  {
    question: "Can I bring my own Claude or ChatGPT subscription?",
    answer:
      "Yes! Terragon supports both Claude and ChatGPT subscriptions. You can connect your existing Claude or ChatGPT subscription within your agent settings.",
  },
  {
    question: "How does Terragon handle security?",
    answer: (
      <>
        Tasks are run in ephemeral sandboxes that are with no persistent access.
        Code is only accessed during active task execution when you request it.
        Credentials are encrypted at rest and in transit using industry-standard
        encryption.
        <Link
          target="_blank"
          href="https://docs.terragonlabs.com/docs/security-permissions"
          className="underline hover:no-underline"
        >
          Learn more →
        </Link>
      </>
    ),
  },
];

function FAQItem({
  question,
  answer,
  isOpen,
  onClick,
}: {
  question: string;
  answer: React.ReactNode;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onClick}
        className="w-full py-5 px-6 flex items-center justify-between gap-4 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="font-semibold text-foreground">{question}</span>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-6 pb-5">
          <p className="text-muted-foreground leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="container mx-auto px-4 max-w-7xl py-16 md:py-24">
      <div className="text-center mb-12 md:mb-16">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          Frequently asked questions
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Everything you need to know about Terragon
        </p>
      </div>
      <div className="max-w-3xl mx-auto">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {faqs.map((faq, index) => (
            <FAQItem
              key={index}
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
