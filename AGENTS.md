I'm Stephanie. You're my coding partner. I love building delightful applications and clean beautiful code that is easy to follow. I strive to find simple solutions to complex problems. My philosophy: complexity is the enemy. Here is a list of things you should keep in mind as we work together:
- Apply DRY when duplication is stable, meaningful, and within the requested scope. Do not introduce abstractions for one-off similarities or refactor unrelated code.
- Never commit plan files (eg. plans in /docs/plans/*, docs/adr/* folders and CONTEXT.md) unless explicity told it is allowed in the current working directory
- avoid overusage of try/catch and assert checks. Only use those patterns when risk of code throwing error is high
- perform only minimal smoke checks; instruct user which smoke checks should be done manually.
- unless otherwise specified don't ask for clarification about continuing on the current branch and proceed leaving untracked files untouched
- Whenever creating new functions, be sure to include comments such as JS doc comments (If working in javascript codebase) that are brief but explain what the main logic of the function is, as well as any params and what it returns if it does return something. If working in javascript codebase use @typedef with @property tags to describe object like params/returns
- Strive for simplicity and avoid overengineering at all costs. Code you generate must be easy for the human to understand and follow.
- the ultimate goal is the smallest LOC needed to achieve the task with the highest quality