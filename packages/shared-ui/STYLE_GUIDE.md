# Allied Recruitment Portal - Design System Style Guide

**Version:** 1.0.0  
**Last Updated:** December 2024

This document provides comprehensive guidance on using the Allied Recruitment Portal design system. The design system ensures visual consistency across all three applications: Recruitment Portal, Branch Manager Portal, and Booking Page.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Colour Palette](#colour-palette)
3. [Typography](#typography)
4. [Spacing](#spacing)
5. [Layout](#layout)
6. [Components](#components)
7. [Utilities](#utilities)
8. [Responsive Design](#responsive-design)

---

## Getting Started

### Installation

The design system is included in the `@allied/shared-ui` package. Import it in your application:

```css
/* Import the complete design system */
@import '@allied/shared-ui/styles';

/* Or import specific modules */
@import '@allied/shared-ui/styles/design-system.css';
```

### File Structure

```
packages/shared-ui/src/styles/
├── _variables.css      # Design tokens (colours, spacing, etc.)
├── _typography.css     # Font styles and text utilities
├── _utilities.css      # Layout and helper classes
├── design-system.css   # Main entry point (imports all above)
└── index.css           # Complete styles including components
```

---

## Colour Palette

### Brand Colours

Our primary brand colour is a professional healthcare cyan, conveying trust and reliability.

| Token | Value | Usage |
|-------|-------|-------|
| `--color-brand-primary-50` | `#ecfeff` | Lightest tint, backgrounds |
| `--color-brand-primary-100` | `#cffafe` | Light backgrounds |
| `--color-brand-primary-200` | `#a5f3fc` | Borders, focus rings |
| `--color-brand-primary-500` | `#06b6d4` | Secondary actions |
| `--color-brand-primary-600` | `#0891b2` | **Primary brand colour** |
| `--color-brand-primary-700` | `#0e7490` | Hover states |
| `--color-brand-primary-800` | `#155e75` | Dark accents |

### Neutral Colours (Greys)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-gray-50` | `#f9fafb` | Page backgrounds |
| `--color-gray-100` | `#f3f4f6` | Card backgrounds, disabled |
| `--color-gray-200` | `#e5e7eb` | Borders, dividers |
| `--color-gray-300` | `#d1d5db` | Input borders |
| `--color-gray-400` | `#9ca3af` | Placeholder text, icons |
| `--color-gray-500` | `#6b7280` | Secondary text |
| `--color-gray-600` | `#4b5563` | Body text |
| `--color-gray-700` | `#374151` | Labels, emphasis |
| `--color-gray-800` | `#1f2937` | Headings |
| `--color-gray-900` | `#111827` | Primary text |

### Semantic Colours

| Status | Primary | Light Background |
|--------|---------|------------------|
| Success | `--color-success-500` (#10b981) | `--color-success-50` |
| Warning | `--color-warning-500` (#f59e0b) | `--color-warning-50` |
| Error | `--color-error-500` (#ef4444) | `--color-error-50` |
| Info | `--color-info-500` (#3b82f6) | `--color-info-50` |

### Candidate Status Colours

Specific colours for the recruitment workflow:

| Status | Colour | Background |
|--------|--------|------------|
| New | `--color-status-new` (Violet) | `--color-status-new-bg` |
| Screening | `--color-status-screening` (Cyan) | `--color-status-screening-bg` |
| Interview | `--color-status-interview` (Blue) | `--color-status-interview-bg` |
| Trial | `--color-status-trial` (Amber) | `--color-status-trial-bg` |
| Offer | `--color-status-offer` (Green) | `--color-status-offer-bg` |
| Hired | `--color-status-hired` (Emerald) | `--color-status-hired-bg` |
| Rejected | `--color-status-rejected` (Red) | `--color-status-rejected-bg` |
| Withdrawn | `--color-status-withdrawn` (Grey) | `--color-status-withdrawn-bg` |

---

## Typography

### Font Family

We use Inter as our primary font with system font fallbacks:

```css
font-family: var(--font-family-sans);
/* 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ... */
```

### Font Sizes

| Token | Size | Usage |
|-------|------|-------|
| `--font-size-2xs` | 10px | Tiny labels |
| `--font-size-xs` | 12px | Captions, badges |
| `--font-size-sm` | 14px | Body small, labels |
| `--font-size-base` | 16px | Body text (default) |
| `--font-size-lg` | 18px | Large body, h4 |
| `--font-size-xl` | 20px | h3 |
| `--font-size-2xl` | 24px | h2 |
| `--font-size-3xl` | 30px | h1 |
| `--font-size-4xl` | 36px | Display text |

### Font Weights

```css
--font-weight-normal: 400;    /* Body text */
--font-weight-medium: 500;    /* Labels, buttons */
--font-weight-semibold: 600;  /* Headings, emphasis */
--font-weight-bold: 700;      /* Strong emphasis */
```

### Heading Examples

```html
<h1>Page Title</h1>           <!-- 30px, semibold -->
<h2>Section Header</h2>       <!-- 24px, semibold -->
<h3>Subsection</h3>           <!-- 20px, semibold -->
<h4>Card Title</h4>           <!-- 18px, semibold -->
```

### Text Utility Classes

```html
<p class="text-sm text-gray-500">Helper text</p>
<p class="text-lg font-semibold">Emphasis</p>
<span class="text-xs uppercase tracking-wide">Overline</span>
```

---

## Spacing

Based on a 4px (0.25rem) base unit:

| Token | Value | Pixels |
|-------|-------|--------|
| `--spacing-1` | 0.25rem | 4px |
| `--spacing-2` | 0.5rem | 8px |
| `--spacing-3` | 0.75rem | 12px |
| `--spacing-4` | 1rem | 16px |
| `--spacing-5` | 1.25rem | 20px |
| `--spacing-6` | 1.5rem | 24px |
| `--spacing-8` | 2rem | 32px |
| `--spacing-10` | 2.5rem | 40px |
| `--spacing-12` | 3rem | 48px |
| `--spacing-16` | 4rem | 64px |

### Spacing Utilities

```html
<!-- Padding -->
<div class="p-4">...</div>     <!-- padding: 16px -->
<div class="px-6 py-4">...</div> <!-- horizontal: 24px, vertical: 16px -->

<!-- Margin -->
<div class="mt-4 mb-6">...</div> <!-- top: 16px, bottom: 24px -->
<div class="mx-auto">...</div>   <!-- center horizontally -->

<!-- Gap (for flex/grid) -->
<div class="flex gap-4">...</div> <!-- 16px between children -->
```

---

## Layout

### Breakpoints

| Name | Width | Usage |
|------|-------|-------|
| sm | 640px | Small tablets |
| md | 768px | Tablets |
| lg | 1024px | Laptops |
| xl | 1280px | Desktops |
| 2xl | 1536px | Large screens |

### Application Layout Tokens

```css
--sidebar-width: 256px;
--sidebar-width-collapsed: 64px;
--header-height: 64px;
--content-max-width: 1280px;
--content-padding: 1.5rem;
```

### Flexbox Utilities

```html
<div class="flex items-center justify-between gap-4">
  <div class="flex-1">Content</div>
  <div class="shrink-0">Actions</div>
</div>
```

### Grid Utilities

```html
<div class="grid grid-cols-3 gap-6">
  <div>Column 1</div>
  <div>Column 2</div>
  <div>Column 3</div>
</div>
```

---

## Components

### Buttons

```html
<!-- Primary Button -->
<button class="btn btn-primary">Save Changes</button>

<!-- Secondary Button -->
<button class="btn bg-gray-100 text-gray-900 hover:bg-gray-200">Cancel</button>

<!-- Outlined Button -->
<button class="btn border border-gray-300 bg-white text-gray-700">Edit</button>
```

### Cards

```html
<div class="card">
  <h3 class="card-title">Card Title</h3>
  <p class="card-body">Card content goes here...</p>
</div>

<!-- Interactive card with hover effect -->
<div class="card card-interactive">...</div>
```

### Inputs

```html
<div class="form-field">
  <label class="form-label">Email Address</label>
  <input type="email" class="input" placeholder="you@example.com" />
  <p class="form-hint">We'll never share your email.</p>
</div>

<!-- Input with error -->
<input class="input input-error" />
<p class="form-error">This field is required</p>
```

### Badges

```html
<span class="badge badge-success badge-md">Hired</span>
<span class="badge badge-warning badge-sm">Pending</span>
<span class="status-badge status-badge-md" style="background: var(--color-status-new-bg); color: var(--color-status-new);">
  <span class="status-badge-dot"></span>
  New
</span>
```

### Alerts

```html
<div class="alert alert-success">
  <div class="alert-icon">✓</div>
  <div class="alert-content">
    <p class="alert-title">Success</p>
    <p class="alert-message">Your changes have been saved.</p>
  </div>
</div>
```

---

## Utilities

### Display

```css
.hidden, .block, .inline-block, .flex, .inline-flex, .grid
```

### Visibility

```css
.visible, .invisible, .sr-only /* screen reader only */
```

### Borders & Radius

```html
<div class="border border-gray-200 rounded-lg">...</div>
<div class="border-t border-gray-100">...</div> <!-- top border only -->
```

### Shadows

```html
<div class="shadow-sm">Subtle shadow</div>
<div class="shadow-md">Medium shadow</div>
<div class="shadow-lg">Large shadow</div>
```

### Transitions

```html
<button class="transition-colors duration-150">Hover me</button>
```

### Overflow

```css
.overflow-hidden, .overflow-auto, .overflow-x-auto, .overflow-y-scroll
```

---

## Responsive Design

Use responsive prefixes for breakpoint-specific styles:

```html
<!-- Stack on mobile, row on tablet+ -->
<div class="flex flex-col md:flex-row gap-4">...</div>

<!-- Hide on mobile, show on desktop -->
<div class="hidden lg:block">Desktop only</div>

<!-- Different padding at breakpoints -->
<div class="p-4 md:p-6 lg:p-8">...</div>
```

### Available Responsive Prefixes

- `sm:` - 640px and up
- `md:` - 768px and up
- `lg:` - 1024px and up
- `xl:` - 1280px and up

---

## Accessibility

### Focus States

All interactive elements have visible focus indicators:

```css
.focus-ring:focus-visible {
  outline: 2px solid var(--color-brand-primary-500);
  outline-offset: 2px;
}
```

### Screen Reader Utilities

```html
<span class="sr-only">Additional context for screen readers</span>
```

### Colour Contrast

All text colours meet WCAG AA contrast requirements against their intended backgrounds.

---

## Animation

### Available Animations

```html
<div class="animate-fade-in">Fades in</div>
<div class="animate-slide-in-top">Slides from top</div>
<div class="animate-spin">Spinning loader</div>
<div class="animate-pulse">Pulsing effect</div>
```

### Skeleton Loading

```html
<div class="skeleton skeleton-text" style="width: 200px;"></div>
<div class="skeleton skeleton-avatar-md"></div>
```

---

## Best Practices

1. **Use design tokens** - Always use CSS variables instead of hardcoded values
2. **Maintain consistency** - Use the defined spacing scale, don't create arbitrary values
3. **Mobile-first** - Write base styles for mobile, add responsive overrides for larger screens
4. **Semantic HTML** - Use appropriate HTML elements before adding classes
5. **Accessibility** - Ensure sufficient colour contrast and keyboard navigation

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2024 | Initial design system release |

---

*This style guide is maintained as part of the Allied Recruitment Portal project.*
