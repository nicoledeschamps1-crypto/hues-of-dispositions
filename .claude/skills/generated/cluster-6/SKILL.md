---
name: cluster-6
description: "Skill for the Cluster_6 area of blob-tracking-project. 7 symbols across 1 files."
---

# Cluster_6

7 symbols | 1 files | Cohesion: 45%

## When to Use

- Understanding how getVisibleTimeRange, timeToPercent, updateTimelinePlayhead work
- Modifying cluster_6-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-timeline.js` | getVisibleTimeRange, timeToPercent, updateTimelinePlayhead, formatTime, renderTimelineRuler (+2) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getVisibleTimeRange` | Function | `blob-timeline.js` | 175 |
| `timeToPercent` | Function | `blob-timeline.js` | 184 |
| `updateTimelinePlayhead` | Function | `blob-timeline.js` | 326 |
| `formatTime` | Function | `blob-timeline.js` | 368 |
| `renderTimelineRuler` | Function | `blob-timeline.js` | 436 |
| `_updateSublanePlayhead` | Function | `blob-timeline.js` | 894 |
| `updateSublanePlayheads` | Function | `blob-timeline.js` | 984 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `OnUp → GetTimelineDuration` | cross_community | 6 |
| `OnMove → GetTimelineDuration` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_5 | 3 calls |
| Cluster_7 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getVisibleTimeRange"})` — see callers and callees
2. `gitnexus_query({query: "cluster_6"})` — find related execution flows
3. Read key files listed above for implementation details
