---
name: cluster-8
description: "Skill for the Cluster_8 area of blob-tracking-project. 6 symbols across 1 files."
---

# Cluster_8

6 symbols | 1 files | Cohesion: 57%

## When to Use

- Understanding how parseTimeInput, updateOffsetLabel, renderTimelineWaveform work
- Modifying cluster_8-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-timeline.js` | parseTimeInput, updateOffsetLabel, renderTimelineWaveform, onWfMove, commitStartTime (+1) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `parseTimeInput` | Function | `blob-timeline.js` | 374 |
| `updateOffsetLabel` | Function | `blob-timeline.js` | 390 |
| `renderTimelineWaveform` | Function | `blob-timeline.js` | 606 |
| `onWfMove` | Function | `blob-timeline.js` | 1889 |
| `commitStartTime` | Function | `blob-timeline.js` | 1951 |
| `onDrag` | Function | `blob-timeline.js` | 1983 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_7 | 2 calls |
| Cluster_6 | 2 calls |
| Cluster_9 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "parseTimeInput"})` — see callers and callees
2. `gitnexus_query({query: "cluster_8"})` — find related execution flows
3. Read key files listed above for implementation details
