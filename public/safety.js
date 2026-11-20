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
  // Who gets hurt: an object pronoun that ends the phrase ("slapped her and..."),
  // so "shook her head" or "kicked my football" do not count.
  const PERSON = "(?:me|him|her|them|us|the baby)";
  const AFTER =
    "(?=\\s*(?:$|[.,!?;:]|(?:and|when|so|because|until|till|with|in|on|at|hard|badly|really|again|every|all|if|after|before|for|while|but|then|twice|once|today|yesterday|last|to|behind|up|around|over|again)\\b))";
  // Between the adult and the verb: a few words, but not "said"/"told" (reported speech
  // about someone else: "teacher said Tom hit him").
  const GAP = "(?:(?!\\b(?:said|says|told|tells|saw|sees|thinks|thought|heard)\\b)[^.!?]){0,30}?";
  const BODY = "(?:face|head|arm|arms|hand|hands|leg|legs|back|neck|skin|ear|ears|cheek|tummy|bottom)";

  const PATTERNS = [
    // An adult hurting a person: "dad hit me", but not "dad hit the ball".
    new RegExp(`\\b${ADULT}\\b${GAP}\\b${HURT}\\s+${PERSON}${AFTER}`),
    // ...or a body part: "mum burned my hand" (not "hit/kicked/hurt", which are ordinary
    // for one's own head or a football).
    new RegExp(`\\b${ADULT}\\b${GAP}\\b(?:slap\\w*|punch\\w*|burn\\w*|smack\\w*|chok\\w*|whip\\w*|beat\\w*)\\s+(?:my|his|her|their|our)\\s+${BODY}\\b`),
    new RegExp(`\\b${ADULT}\\b${GAP}\\bgrab\\w*\\s+(?:\\w+\\s+)?by\\s+the\\s+(?:neck|throat|hair)`),
    new RegExp(`\\b(?:hit|kicked|slapped|punched|beaten|hurt|attacked|shaken|abused)\\s+by\\s+(?:a|an|the|my|his|her|their)?\\s*${ADULT}\\b`),
    /\babus\w*/, // abuse, abused, abusing (also French "abus", Spanish "abuso")
    /\bmolest\w*/,
    // Inappropriate touching
    /\bprivate (?:parts|bits|area)\b/,
    /\btouch\w*\s+(?:him|her|me|them)\s+(?:where|in a (?:bad|wrong|weird|strange) way)/,
    /\btouch\w*\s+(?:his|her|my|their)\s+(?:private|bottom|willy|vagina|penis)/,
    // Serious injury or emergency. "hospital" counts unless the note is about a visit,
    // a birth or a check-up anywhere in it.
    /\bambulance\b/,
    /^(?![\s\S]*\b(?:visit\w*|new baby|was born|check-?up)\b)[\s\S]*\bhospital\b/,
    /\b(?:stopped breathing|passed out|unconscious|concussion|seizure|knocked out)\b/,
    /\bbleeding (?:a lot|badly|heavily)|\blots of blood\b/,
    /\bhit by a (?:car|bus|truck|van|bike|motorbike|lorry|train)\b/,
    /\bfell (?:from|off|out of) (?:a|the|our|his|her) (?:balcony|window|roof)\b/,
    /\b(?:broke|broken) (?:his|her|my|their) (?:arm|leg|wrist|neck|back|skull)\b/,
    /\b(?:seriously|badly) hurt\b|\bhurt (?:him|her|me|them) badly\b/,
    // Neglect and danger at home
    /\bleft (?:alone|on (?:his|her|my) own)\b[^.!?]{0,40}\b(?:days?|nights?|overnight|hours)\b/,
    /\b(?:no food|nothing to eat)\b(?![^.!?]*\b(?:in the (?:lunch ?box|bag)|left on (?:the|my) plate)\b)/,
    /\b(?:hasn'?t|has not|haven'?t|not) eaten (?:anything|for)\b/,
    /\b(?:scared|afraid|frightened|terrified) (?:to go|of going) home\b/,
    /\b(?:doesn'?t|does not|don'?t|won'?t|do not) want to go home\b(?!\s+(?:from|yet|now|because (?:it was|we were) (?:fun|having fun)))/,
    /\bnot safe (?:at home|there)\b|\b(?:feels?|felt|feeling) unsafe\b|\bunsafe (?:at home|there)\b|\bin danger\b/,
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
