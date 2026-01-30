# Release Notes Template and Guidelines

## Template

```mdx
## [Month DD, YYYY]

**Features**

- **[Feature name]**: [Description in sentence case]
- **[Feature category]**:
  - [Sub-feature detail]
  - [Sub-feature detail]

**UX Improvements & Bug Fixes**

- [Description in sentence case]
- In [early access](/docs/resources/early-access-features):
  - [Early access feature or fix]
```

## Writing Guidelines

### Format Rules

- **Date**: Full month name (e.g., `August 27, 2025`)
- **Sentence case**: Capitalize only first word and proper nouns
- **Bold**: Feature names/categories followed by colons
- **Backticks**: Commands (`create`), flags (`--model`), paths (`/docs/`)
- **Punctuation**: End all items with periods

### Writing Good Descriptions

- **Lead with user value**: Explain what users can now do or how their experience improves
- **Include access details**: Describe how to access/use the feature (except for early access items)
- **Be concise**: Combine value and access in 1-2 sentences when possible

### Content Organization

#### Features Section

- Major functionality and enhancements
- Group related items (e.g., "CLI Enhancements")
- Order by importance/impact

#### UX Improvements & Bug Fixes Section

- UI improvements, performance fixes, minor enhancements
- Group early access items under sub-list with link

### Early Access Features

#### New Early Access Features

```mdx
**Features**

- In [early access](/docs/resources/early-access-features):
  - **[Feature name]**: [Description]
```

#### Graduating from Early Access

```mdx
**Features**

- **[Feature name] (out of early access)**: [Description]
```

#### Changes to Existing Early Access Features

```mdx
**UX Improvements & Bug Fixes**

- In [early access](/docs/resources/early-access-features):
  - [Description of change to early access feature]
```

### Examples

✓ **Good**

```mdx
- **Context usage display**: Context usage is now displayed within tasks above the prompt box
- **Plan Mode for Claude Code (out of early access)**: You can now use Claude Code's plan mode when creating new tasks. Change the mode selector in the bottom left of the prompt box to "Plan"
- **CLI Enhancements**:
  - Added `--model` flag to specify AI model for `create` command
- Fixed page flickering on home page
```

✗ **Avoid**

```mdx
- **Plan Mode**: Added plan mode // Doesn't explain user value or how to access
- **Context Usage**: Now available // Too vague, no details
- CLI: new model flag added // Inconsistent format, lacks detail
- fixed flickering // Missing capitalization
```

### Links

- Link early access features on first mention only
- Link to relevant docs for new features
- Format: `[text](/docs/path/to/page)`

## Checklist

- [ ] Date formatted correctly
- [ ] Features ordered by importance
- [ ] Sentence case throughout
- [ ] All items end with periods
- [ ] Early access items properly grouped and linked
- [ ] Technical terms in backticks
