---
layout: default
title: "Hello World"
description: "A quick tour of the Markdown bits you get for free with Jekyll."
---

# Welcome to DM2K9.NET

A quick sampler of Markdown and Jekyll goodies in one place: headings, emphasis, lists, quotes, code, tables, images, and even footnotes.[^footnote-demo]

## Headings & emphasis

Mix **bold**, _italic_, and `inline code` inside a normal paragraph. Combine them to call out important ideas without breaking flow.

### Subheadings keep things tidy

Use smaller headings to break sections. They help both readability and anchor links.

## Lists

- Bullets help you group ideas.
- Nest them if you like:
  - Secondary thoughts live here.
- Add links inline, e.g., [Projects]({{ "/projects" | relative_url }}).

1. Numbered lists track sequences.
2. You can still add `inline code`.
3. Wrap up with a final thought.

## Blockquotes

> Good notes are just reusable thoughts.

## Code

Inline snippets: `bundle exec jekyll serve`.

Fenced blocks:

```bash
bundle install
bundle exec jekyll serve --livereload
```

Syntax highlighting with Liquid’s highlight tag:

{% highlight ruby %}
puts "Hello, world!"
3.times { |n| puts "Line #{n}" }
{% endhighlight %}

## Tables

| Syntax  | Purpose                   | Example                 |
| ------- | ------------------------- | ----------------------- |
| Bold    | Emphasize key bits        | **important**           |
| Code    | Show commands or snippets | `jekyll build`          |
| Links   | Point to other content    | [Home]({{ "/" | relative_url }}) |

## Images & media

Inline image with alt text:

![DM2K9 neon logo]({{ "/dm2k9_logo.png" | relative_url }})

## Horizontal rules

Use them to mark a shift in topic.

---

## Footnotes

You can add extra context without cluttering the main text.[^another-note]

[^footnote-demo]: Markdown footnotes are rendered at the bottom of the page automatically.
[^another-note]: They also support Markdown inside the footnote content.
