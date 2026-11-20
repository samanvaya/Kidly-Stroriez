// Offline safety check (SR-03, KI-002). Used only when there is no AI: the built-in
// story is about sharing a toy, so notes about something serious must not get it.
// Live mode relies on the model's judgement instead. A phrase list cannot catch
// everything; it is tested against test/safety-cases.js.
(function (root) {
  "use strict";

  const ADULT =
    "(?:grown ?-?ups?|adults?|(?:step ?)?(?:dad|daddy|father|mum|mummy|mom|mommy|mother|papa|mama|parents?)|" +
    "uncles?|aunts?|aunties?|grand(?:pa|ma|father|mother)s?|teachers?|babysitters?|nann(?:y|ies)|coach(?:es)?|" +
    "neighbou?rs?|strangers?|man|men|woman|women|boyfriend|girlfriend|older (?:kid|boy|girl|child|children))";
  const HURT =
    "(?:hit|hits|hitting|kick(?:s|ed|ing)?|slap(?:s|ped|ping)?|punch(?:es|ed|ing)?|beat(?:s|en|ing)?|" +
    "chok(?:e|es|ed|ing)|strangl\\w*|burn(?:s|ed|t|ing)?|shake|shakes|shook|shaking|hurt(?:s|ed|ing)?|" +
    "smack(?:s|ed|ing)?|whip(?:s|ped|ping)?|attack(?:s|ed|ing)?)";
  // Who gets hurt. When in doubt this errs towards flagging: a missed serious note is
  // worse than a false alarm. "her" followed by a thing ("shook her head", "hurt her
  // knee") is a possessive, not a person.
  const FAMILY =
    "(?:little\\s+|big\\s+|baby\\s+|younger\\s+|older\\s+)?(?:mum|mom|mummy|mommy|mother|dad|daddy|father|brother|brothers|sister|sisters|baby|son|daughter|child|children|kid|kids|family|friend|cousin|nan|nana|grandma|grandpa|twin|twins)";
  const HER_THING =
    "(?:head|hand|hands|knee|knees|toast|own|hair|car|bag|phone|food|dinner|lunch|book|nose|eyes|way|best|toy|toys|shoe|shoes|coat|keys|drink|cup|tea|coffee|foot|feet|ankle|back|elbow|finger|fingers|thumb|toe|toes|wrist|shoulder)";
  const PERSON = `(?:me|him|them|us|the baby|her(?!\\s+${HER_THING}\\b)|(?:my|his|her|their|our)\\s+${FAMILY}\\b)`;
  // Between the adult and the verb: a few words, but not reported speech about someone
  // else ("teacher said Tom hit him"). Threats are matched separately below.
  const GAP = "(?:(?!\\b(?:said|says|told|tells|saw|sees|thinks|thought|heard)\\b)[^.!?]){0,30}?";
  const BODY = "(?:face|head|arm|arms|hand|hands|leg|legs|back|neck|skin|ear|ears|cheek|tummy|bottom)";

  const PATTERNS = [
    // An adult hurting a person: "dad hit me", "dad punched my brother", but not "dad
    // hit the ball" or "mum shook her head".
    new RegExp(`\\b${ADULT}\\b${GAP}\\b${HURT}\\s+${PERSON}`),
    // Threats: "dad said he would hit me", "mum told me she will hurt me if I tell".
    new RegExp(`\\b${ADULT}\\b[^.!?]{0,40}?\\b(?:said|says|told|tells|threaten\\w*)\\b[^.!?]{0,40}?\\b(?:would|will|'ll|gonna|going to)\\s+${HURT}\\s+${PERSON}`),
    // ...or a body part: "mum burned my hand", "dad hit my face". Hit/kick/hurt only with
    // "my" (the child's own words), since "grandma hurt her knee" is ordinary.
    new RegExp(`\\b${ADULT}\\b${GAP}\\b(?:slap\\w*|punch\\w*|burn\\w*|smack\\w*|chok\\w*|whip\\w*|beat\\w*)\\s+(?:my|his|her|their|our)\\s+${BODY}\\b`),
    new RegExp(`\\b${ADULT}\\b${GAP}\\b(?:hit|hits|kick\\w*|hurt\\w*)\\s+my\\s+${BODY}\\b`),
    new RegExp(`\\b${ADULT}\\b${GAP}\\bgrab\\w*\\s+(?:\\w+\\s+)?by\\s+the\\s+(?:neck|throat|hair)`),
    new RegExp(`\\b(?:hit|kicked|slapped|punched|beaten|hurt|attacked|shaken|abused)\\s+by\\s+(?:a|an|the|my|his|her|their)?\\s*${ADULT}\\b`),
    /\babus\w*/, // abuse, abused, abusing (also French "abus", Spanish "abuso")
    /\bmolest\w*/,
    // Inappropriate touching
    /\bprivate (?:parts|bits|area)\b/,
    /\btouch\w*\s+(?:him|her|me|them)\s+(?:where|in a (?:bad|wrong|weird|strange) way)/,
    /\btouch\w*\s+(?:his|her|my|their)\s+(?:private|bottom|willy|vagina|penis)/,
    // Serious injury or emergency.
    /\bambulance\b/,
    // A visit, a birth or a check-up in the same sentence, right next to "hospital",
    // makes it ordinary; "we visited nana, then he fell and went to hospital" still counts.
    /(?:^|[.!?])(?![^.!?]*\b(?:new baby|was born|check-?up)\b)(?![^.!?]*\bvisit\w*\s+(?:\w+\s+){0,3}(?:in|at|to)\s+(?:the\s+)?hospital)(?![^.!?]*\bhospital\s+(?:to\s+visit|visiting))[^.!?]*\bhospital\b/,
    /\b(?:stopped breathing|passed out|unconscious|concussion|seizure|knocked out)\b/,
    /\bbleeding (?:a lot|badly|heavily)|\blots of blood\b/,
    /\bhit by a (?:car|bus|truck|van|bike|motorbike|lorry|train)\b/,
    /\bfell (?:from|off|out of) (?:a|the|our|his|her) (?:balcony|window|roof)\b/,
    /\b(?:broke|broken) (?:his|her|my|their) (?:arm|leg|wrist|neck|back|skull)\b/,
    /\b(?:seriously|badly) hurt\b|\bhurt (?:him|her|me|them) badly\b/,
    // Neglect and danger at home
    /\bleft (?:alone|on (?:his|her|my) own)\b[^.!?]{0,40}\b(?:days?|nights?|overnight|hours)\b/,
    /\b(?:no food|nothing to eat)\b(?![^.!?]*\b(?:in the (?:lunch ?box|bag)|left on (?:the|my) plate)\b)/,
    /\b(?:hasn'?t|has not|haven'?t|not|didn'?t|did not) (?:eaten|eat) (?:anything|for|since|all day|in days|properly for)\b/,
    /\b(?:scared|afraid|frightened|terrified) (?:to go|of going) home\b/,
    /\b(?:doesn'?t|does not|don'?t|won'?t|do not) want to go home\b(?!\s+(?:from|yet|now|because (?:it was|we were) (?:fun|having fun)))/,
    /\bnot safe (?:at home|there)\b|\b(?:feels?|felt|feeling) unsafe\b|\bunsafe (?:at home|there)\b|\bin danger\b/,
    /\bhome (?:is|feels|isn'?t) (?:not safe|unsafe|scary|dangerous|safe)\b(?<!is safe)(?<!feels safe)/,
    /\bpolice (?:came|come|took|were called|was called|at our|to our)\b/,
    // Self-harm
    /\bwants? to die\b(?! laughing)|\bwanted to die\b(?! laughing)/,
    /\bkill (?:himself|herself|myself|themselves|themself)\b/,
    /\b(?:cutting|cuts?|hurting|hurts?|hurt) (?:himself|herself|myself|themselves)\b/,
    /\bself-? ?harm\w*|\bsuicid\w*/,
    // German, Spanish, French
    /\b(?:geschlagen|missbrauch\w*|krankenhaus|angst[^.!?]{0,20}nach hause)\b/,
    /\b(?:me|le|nos|les) pego\b|\bpegaron\b/,
    /\b(?:a|ont|m'a|l'a|nous a|m'ont|l'ont) (?:ete )?frappee?s?\b|\battouch\w*/,
  ];

  function normalise(text) {
    return text
      .slice(0, 2000)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // é -> e
      .replace(/[‘’]/g, "'")
      .toLowerCase();
  }

  function isWorrying(text) {
    if (typeof text !== "string" || !text.trim()) return false;
    const t = normalise(text);
    return PATTERNS.some((re) => re.test(t));
  }

  root.KidlySafety = { isWorrying, PATTERNS };
})(typeof window !== "undefined" ? window : globalThis);
