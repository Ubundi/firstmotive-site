# Custom robot training data and multimodal capture

> We design and run task-specific data collection for robotics and Physical AI teams: egocentric vision, depth, motion, and tactile signals, synchronized and packaged with the evidence needed to use them responsibly.

First Motive designs task-specific data engagements for robotics, VLA, imitation-learning, manipulation, and Physical AI teams. We start from the model, benchmark, evaluation, or deployment decision the data must support.

## Services

From a data brief to an inspectable dataset.

We start with the model, evaluation, or deployment decision the data must support. That keeps collection, quality work, annotation, and packaging tied to a real downstream use.

### 1. Custom multimodal data collection

We define the task and capture setup, then record human demonstrations or robot episodes in the relevant environment. Vision, depth, motion, and tactile signals are selected because the use case needs them, not to inflate a modality count.

### 2. Dataset processing and quality validation

Raw source stays identifiable while streams are inventoried, aligned, and normalized. Quality checks record missingness, timing, coverage, and disposition so a team can see what passed, what changed, and what remains uncertain.

### 3. Annotation, review, and delivery

Annotations and review decisions stay linked to exact source inputs. Delivery packages can include provenance, rights and use metadata, verification steps, and a consumer-specific projection such as RLDS when the underlying action and state evidence supports it.

## Fit and delivery

### A useful fit when

- Your VLA or robot-learning team needs manipulation demonstrations beyond a generic open dataset.
- Your deployment team needs data from the target task, environment, objects, or sensor setup.
- You have recordings, but quality, lineage, annotation, or conversion blocks confident use.
- Your benchmark or evaluation needs independent real-world ground truth.

### Delivery can include

- Immutable source recordings in MCAP, rosbag2, or an agreed source format.
- Normalized episodes, stream manifests, quality reports, and source-linked annotations.
- Observation or pre-training datasets when robot action and state evidence is absent.
- RLDS or another consumer-specific projection when the schema and eligibility contract are defined.

## Capture modalities

| # | Modality | Sensors | Sample rate | What it records |
| --- | --- | --- | --- | --- |
| 01 | Vision capture | Head RGB, Wrist L, Wrist R | 30 Hz | What the eyes see. What the hands see. |
| 02 | Depth & space capture | Head Depth, Chest LiDAR | — | Not pixels. Geometry. |
| 03 | Motion capture | IMU Hand Track | 200 Hz | The trajectory between reach and grasp. |
| 04 | Touch & force capture | Glove Tactile | 40 Hz | The part video cannot record. |
| 05 | Capture integrity | — | — | We record the recording. |

## Data pipeline

One engine, three accountable stages: Capture → Validate → Deliver.

We preserve an evidence chain across each episode: what was recorded, how streams were aligned, which checks ran, what was derived, who reviewed it, and what a recipient is approved to use.

## Common questions

### What does First Motive provide?

First Motive designs task-specific robotics data engagements. Work can include capture-system design, real-world human demonstration or robot-episode collection, multimodal synchronization, dataset processing, quality validation, annotation, review, and recipient-specific delivery.

### Who is this for?

We work with robotics, VLA, imitation-learning, manipulation, and Physical AI teams that need data tied to a specific task or deployment. The engagement starts from the downstream model, benchmark, evaluation, or product decision rather than a generic promise of more data.

### Can human demonstration data be used to train a robot policy?

Not by default. Egocentric demonstrations can support observation learning, pre-training, annotation, or task understanding. Policy training also needs a valid contract for robot action and state, coordinate frames, units, timing, and calibration. We keep those eligibility decisions explicit.

### What makes a robotics dataset training-ready?

We do not use “training-ready” as a blanket label. Readiness depends on the robot, task, model, schema, and intended use. A useful delivery states what was captured, what is missing, which quality checks ran, which transformations were applied, and which uses the evidence supports or blocks.

### Which robotics data formats can you deliver?

Source delivery can retain MCAP or rosbag2 recordings and adjacent capture metadata. Processed delivery can include normalized episode manifests, quality reports, annotations, and consumer-specific formats such as RLDS when the source data has the action, state, timing, and calibration evidence that format requires.

### How do you handle data rights, consent, and privacy?

Permitted use, participant consent, privacy class, retention, recipient, and redistribution boundaries should be defined at intake and carried into delivery. Technical quality checks do not replace customer, legal, or product approval.

## Start a data brief

Send us the task, environment, robot or model, signals you need, intended use, and timeline. We will tell you whether a focused data pilot is a good fit.

Email adii@firstmotive.ai with the task, environment, robot or model, required signals, intended use, and timeline.

---

_Agent-readable version of [firstmotive.ai](https://firstmotive.ai/). Generated from `index.html` by `scripts/build-agent-docs.mjs` — do not edit by hand._
