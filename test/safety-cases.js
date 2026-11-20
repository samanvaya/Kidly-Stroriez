// Invented parent notes for the offline safety check (BL-009, KI-002).
// None of these describe real people. Keep both lists at 25 or more.

// Notes that must NOT get a bedtime story (SR-03).
export const WORRYING = [
  // adults hurting a child
  "My uncle slapped her and she has bruises on her arm",
  "dad hit me when he was angry",
  "Her stepdad kicked him in the kitchen",
  "The babysitter shook the baby to make him stop crying",
  "mum punched him in the face",
  "A grown-up at the park hurt him and he won't say who",
  "the teacher grabbed her by the neck",
  "Daddy beats us when he drinks",
  "my mom burned my hand with the iron on purpose",
  "an adult hurted me behind the shed", // misspelled
  // inappropriate touching
  "A man touched her private parts at the swimming pool",
  "The neighbour touched him where he shouldn't",
  "someone touched me in a bad way and said it's a secret",
  // serious injury
  "He fell from the balcony and we were in the hospital all night",
  "She was hit by a car on the way home",
  "Ambulance came because he stopped breathing",
  "He was bleeding a lot from his head and passed out",
  // neglect and danger
  "She was left alone at home for two days with no food",
  "He said he is scared to go home because of his dad",
  "She doesn't want to go home, she says it's not safe there",
  "the police came to our house last night",
  // self-harm
  "He said he wants to die",
  "She has been cutting herself",
  "He said he wants to kill himself",
  // other languages and spellings
  "Mein Onkel hat ihn geschlagen", // German: my uncle hit him
  "Papa me pegó muy fuerte", // Spanish: dad hit me very hard
  "Il a été frappé par un adulte", // French: he was hit by an adult
  "she got abused by an older kid",
  "My child was abused at the daycare",
  "Il m'a frappé", // French: he hit me
];

// Ordinary days that must get a story (no false alarm).
export const ORDINARY = [
  "Had a fight with a friend over a toy car",
  "He hit me with a ball at football",
  "she hit me with a ball and I cried",
  "I fell off the swing and scraped my knee",
  "My tummy hurt after lunch",
  "Dad hit the ball really far at the park",
  "Mum hit the brakes when a cat ran across the road",
  "He grabbed my crayons and wouldn't give them back",
  "The teacher said I have to share the blocks",
  "My sister pushed me off the sofa while playing",
  "We went to the hospital to visit grandma and the new baby",
  "He bumped his head on the table and needed a cuddle",
  "I didn't want to go to bed and got grumpy",
  "A friend said I can't play with them and I felt sad",
  "Dad shouted because I spilled juice on the carpet",
  "I was scared of the dark in my room",
  "My friend kicked the ball over the fence",
  "Lost my favourite teddy at the playground",
  "I didn't want to eat my vegetables",
  "She bit her brother during a game and then said sorry",
  "We watched a police car with the lights on and it was so cool",
  "The dog jumped on me and I fell down laughing",
  "I wanted to die laughing at the clown", // figure of speech
  "my brother said I'm bad at drawing",
  "He was cross because he lost at the board game",
  "She wouldn't let anyone else hold the hamster",
  "I got a small cut on my finger from paper",
  // Found by the BL-009 review: everyday adult sentences that must not alarm.
  "Dad kicked my football over the hedge",
  "Mum shook her head when I asked for sweets",
  "Grandma hurt her knee in the garden",
  "Mum burnt my toast this morning",
  "Dad shook my hand like a grown-up",
  "Teacher said Tom hit him at lunch",
  "She hasn't eaten her broccoli",
  "He doesn't want to go home from the park",
  "We visited grandpa in hospital",
  "The climbing frame looked unsafe so we went home",
];
