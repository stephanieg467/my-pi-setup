---
description: Implement and review a given plan/requirement
argument-hint: "<plan-file>"
---
Implement the following using subagents. Route all non-trivial test writing, test updates, and test-specific review through the `test-specialist` sub-agent; general implementers should not create or update substantive tests themselves. After worker has implemented run a review of the changes and use worker to address review findings until all findings have been addressed: $@