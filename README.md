# First Motive

Ground-truth infrastructure for Physical AI.

We capture the real-world task data that Physical AI needs to become useful — verified, multi-modal, and train-ready.

## About

First Motive produces the data layer that physical AI systems depend on. Every AI breakthrough has been a data story; physical AI has no data yet. We're building the infrastructure that changes that.

- **Wedge:** Healthcare
- **Based:** Stellenbosch, South Africa

## Local development

Open `index.html` in a browser. No build step required.

## Agent-readable content

The site serves Markdown mirrors for AI agents, served as `text/markdown` by the worker:

- `llms.txt` — root index that points agents at the pages worth reading
- `index.md` — the full one-pager as clean Markdown (facts and modality tables)
- `what-we-do.md`, `how-we-work.md`, `cowork.md` — per-section mirrors

`index.html` is the single source of truth. These files are generated:

```
npm run agent-docs        # regenerate after changing index.html
npm run agent-docs:check  # fail if the committed files drift from index.html
```

Never edit the generated files by hand. Run the check before deploying.

## Contact

[adii@ubundi.com](mailto:adii@ubundi.com) · [firstmotive.ai](https://firstmotive.ai)
