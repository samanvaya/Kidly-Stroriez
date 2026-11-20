# Kidly Storiez: Product Requirements

Status: Draft v0.1 (20 November 2026)
Source: team brainstorming session, plus the first clickable prototype.

Each requirement is tagged with where it came from:

- **[B]** agreed or raised in the brainstorming session
- **[P]** proposed afterwards (from the prototype or product review) and not yet confirmed by the team

Priorities: **Must** = hackathon demo, **Should** = first store release (MVP), **Could** = later.

---

## 1. Summary

Kidly Storiez is a bedtime app that turns something that happened in a child's day into a short interactive story. A parent notes what happened, approves a story plan, and then reads the story with the child. At key moments the child chooses what the hero does and sees what follows from good and not-so-good choices. The story ends with a lesson.

## 2. Problem

- Children often open up about their day in the evening ("I had a fight over a toy").
- Parents get the context but do not always know how to turn it into a lesson that sticks.
- Telling a child what they should have done is less effective than letting them explore the choices themselves.

## 3. Users

| User | Role | Needs |
| --- | --- | --- |
| Parent or caregiver | Enters the day, approves the plan, reads the story | Quick input, control over what the child sees, a useful conversation afterwards |
| Child (working assumption: ages 3 to 9) | Listens and chooses | A hero they like, real choices, a calm ending |

The age range is an assumption from the prototype and needs confirming (see Open questions).

## 4. Core flow

1. **Talk.** The parent asks the child about their day. The app suggests questions to ask.
2. **Capture.** The parent enters the answers: what happened, how the child felt, what the child did.
3. **Plan.** The app proposes a theme, a lesson and the choice moments.
4. **Approve.** The parent confirms the plan or asks for changes. Nothing is written before this.
5. **Story.** The app writes the story. The child picks an option at each choice moment and the story continues from that choice.
6. **Wrap up.** The story ends with the lesson and questions the parent and child can talk about.

## 5. Functional requirements

### 5.1 Capturing the day

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| FR-01 | The app gives the parent prompts to ask the child (what happened, how did it feel, what did you do). | Must | B |
| FR-02 | The parent enters the answers as text. The app does not record the parent-child conversation. | Must | B |
| FR-03 | The parent enters the child's first name and age so the language fits. | Must | P |
| FR-04 | The parent can dictate answers by voice instead of typing. | Could | P |
| FR-05 | The app tells the parent to leave out other children's names. | Should | P |

### 5.2 Story plan and parent approval

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| FR-10 | From the parent's answers the app derives a theme and a lesson for the story. | Must | B |
| FR-11 | Before writing the story, the app shows the parent what it is going to do: theme, lesson, setting and the choice moments. | Must | B |
| FR-12 | The parent can accept the plan or ask for changes in their own words, and gets an updated plan. | Must | B |
| FR-13 | The story is only generated after the parent confirms the plan. | Must | B |
| FR-14 | The plan explains how the story echoes the day, so the parent knows what the child will recognise. | Should | P |

### 5.3 Interactive story

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| FR-20 | The story is delivered as text first. | Must | B |
| FR-21 | At each choice moment the child picks from several options for what the hero does. | Must | B |
| FR-22 | Options include good things to do and not-so-good things to do. | Must | B |
| FR-23 | The story continues from the chosen option and shows what follows from it. | Must | B |
| FR-24 | The story ends with a moral or learning lesson. | Must | B |
| FR-25 | Options are not labelled as good or bad. The child learns from what happens next. | Should | P |
| FR-26 | The child can go back one choice and see what a different option leads to. | Should | P |
| FR-27 | A not-so-good choice leads to honest consequences shown through feelings, never punishment, and leaves a way to put things right. | Should | P |
| FR-28 | The ending includes questions the parent can ask to link the story back to the child's day. | Should | P |
| FR-29 | Length suits bedtime: two choice moments and an ending, about 70 to 110 words per part. | Should | P |

### 5.4 Characters

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| FR-30 | Stories use imaginary characters rather than the real people involved. | Must | B |
| FR-31 | There is a recurring cast, so the same characters appear across stories and stay consistent. | Should | B |
| FR-32 | The child or parent picks the hero for tonight's story. | Should | P |
| FR-33 | The app shows how many stories the child has shared with each hero. | Could | P |
| FR-34 | The hero earns a named sticker at the end of each story. | Could | P |

### 5.5 Media

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| FR-40 | Stories can be read aloud by the app. | Could | B |
| FR-41 | Stories include illustrations, with characters that look the same from story to story. | Could | B |

Images were deferred in the session because they take longer to generate than text.

### 5.6 Accounts and history (store release)

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| FR-50 | The parent has an account. Children do not have accounts. | Should | P |
| FR-51 | Finished stories are saved in a story library and can be viewed and re-read later. | Should | P |
| FR-52 | Parent-only screens sit behind a parent gate. | Should | P |
| FR-53 | The parent can delete any story and all of their data. | Should | P |
| FR-54 | Stories you created or already added to your library can be shared via link; a recipient can view the shared story, add it to their own library, and re-share it from there. | Could | P |

### 5.7 Monetisation

Monetisation was raised in the session without specifics. Everything here is a proposal.

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| FR-60 | Free tier with a limited number of stories per month, paid plan for unlimited stories. | Should | P |
| FR-61 | Additional heroes are available on the paid plan or as packs. | Could | P |
| FR-62 | A child's stories can be ordered as a printed keepsake book. | Could | P |
| FR-63 | Licences for kindergartens and child therapists. | Could | P |

## 6. Safety and content requirements

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| SR-01 | No real person's name appears in a story. Other children become invented characters. | Must | P |
| SR-02 | No character is called bad or naughty, and nothing frightening happens. | Must | P |
| SR-03 | If the parent's notes describe something a story should not handle (a child seriously hurt, unsafe or abused), the app does not write a story and suggests talking to someone the parent trusts. | Must | P |
| SR-04 | Vocabulary and sentence length match the child's age. | Must | P |
| SR-05 | The child never sees generated content the parent has not approved at plan level. | Must | B |
| SR-06 | Every ending is calm and suitable for going to sleep, whatever was chosen. | Should | P |

## 7. Non-functional requirements

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| NFR-01 | Text generation is fast enough to hold a child's attention. Target: the next part starts appearing within 3 seconds and streams as it is written. | Must | B (the 3-second target is P) |
| NFR-02 | The demo has an offline fallback story so it works without a network or model. | Must | P |
| NFR-03 | Store only the data needed to write and save stories. No audio of the child is stored. | Should | P |
| NFR-04 | The app meets the rules that apply to children's apps in each launch market and on each app store. The specific obligations must be confirmed with legal advice before launch. | Should | P |
| NFR-05 | Story text is large and legible enough for a child to follow along. | Should | P |
| NFR-06 | The architecture keeps AI calls on a backend so keys, prompts and safety checks are not in the app. | Should | P |
| NFR-07 | Support for more than one language. | Could | P |
| NFR-08 | Optional parallel pre-generation: after part 1 streams immediately for fast reaction time, continuations for every choice option can be generated via separate parallel prompts in the background so reading starts right away while the full branching story finishes faster. | Could | P |

## 8. Scope by phase

| Phase | Goal | Requirements |
| --- | --- | --- |
| Hackathon | A working demo with one memorable moment | All Must items |
| MVP | First store release | Must and Should items |
| Later | Growth and revenue | Could items |

## 9. Out of scope for now

- Recording or transcribing the conversation between parent and child (decided against in the session).
- The child using the app without a parent.
- Images and audio in the hackathon version.

## 10. Open questions

1. Is the product name "Kidly Storiez"? The repository is spelled "Kidly-Stroriez".
2. What age range are we designing for?
3. How many choice moments should a story have, and should that vary with age?
4. Which markets and app stores do we launch in first? This decides the compliance work in NFR-04.
5. What is the price and the free-tier limit?
6. Who reviews story quality and safety before launch, and how?
7. Which AI model and provider do we use in production, and what does a story cost to generate?
8. Do we keep the parent's notes about the day, or only the finished story?

## 11. Glossary

- **Choice moment:** a point in the story where the child decides what the hero does.
- **Story plan:** the theme, lesson, setting and choice moments shown to the parent for approval.
- **Hero:** the recurring imaginary character who stands in for the child.
