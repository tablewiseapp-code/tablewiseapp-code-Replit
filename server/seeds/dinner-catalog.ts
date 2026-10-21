import type { InsertRecipe } from "../../shared/schema";

export type DinnerSeed = InsertRecipe & { id: string };

// These IDs are permanent identities, not derived from mutable customer titles.
function dinner(slug: string, recipe: Omit<InsertRecipe, "tags">): DinnerSeed {
  return { id: `tablewise:dinner:v1:${slug}`, ...recipe, tags: ["Dinner"] };
}

export const dinnerCatalog: DinnerSeed[] = [
  dinner("tomato-pasta", {
    title: "Tomato pasta", cookTime: 25, servings: "4",
    ingredients: ["400 g dried pasta", "800 g canned chopped tomatoes", "2 tbsp olive oil", "3 cloves garlic, minced", "1 tsp dried oregano", "1 tsp salt, divided", "0.25 tsp black pepper", "30 g Parmesan cheese, grated"],
    steps: [
      "Bring a large pot of water to a boil with half the salt. Cook the pasta according to its packet, about 10 minutes; reserve 150 ml cooking water before draining.",
      "Meanwhile, heat the olive oil in a large pan over medium heat. Cook the garlic for 30 seconds without browning.",
      "Add the tomatoes, oregano, remaining salt and pepper. Simmer uncovered for 15 minutes, stirring occasionally.",
      "Toss the drained pasta with the sauce, adding reserved cooking water a little at a time if needed. Divide among four bowls and top with Parmesan.",
    ],
  }),
  dinner("oven-baked-chicken", {
    title: "Oven-baked chicken", prepTime: 10, cookTime: 50, servings: "4",
    ingredients: ["800 g boneless chicken thighs", "800 g potatoes, cut into 2 cm cubes", "400 g carrots, cut into 1 cm slices", "2 tbsp olive oil", "1 tsp paprika", "1 tsp dried thyme", "1 tsp salt", "0.5 tsp black pepper"],
    steps: [
      "Heat the oven to 220°C. Toss the potatoes and carrots with half the oil and half the salt on a large baking tray. Roast for 15 minutes.",
      "Coat the chicken with the remaining oil and salt, paprika, thyme and pepper.",
      "Turn the vegetables and add the chicken in a single layer, using a second tray if crowded. Roast for 25–30 minutes.",
      "Check the thickest part of each chicken thigh reaches 74°C and the potatoes are tender. Rest the chicken for 5 minutes before serving with the vegetables.",
    ],
  }),
  dinner("vegetable-fried-rice", {
    title: "Vegetable fried rice", cookTime: 20, servings: "4",
    ingredients: ["600 g cooked rice, chilled promptly after cooking", "200 g frozen peas", "200 g carrots, finely diced", "4 eggs, beaten", "3 spring onions, sliced", "2 cloves garlic, minced", "2 tbsp vegetable oil", "3 tbsp soy sauce", "1 tsp sesame oil"],
    steps: [
      "Break up the chilled rice with a fork. Heat half the vegetable oil in a large frying pan over medium-high heat.",
      "Add the eggs and scramble for 1–2 minutes until set. Transfer to a plate.",
      "Add the remaining vegetable oil, carrots and peas. Stir-fry for 5 minutes, then add the garlic and spring onions and cook for 1 minute.",
      "Add the rice and soy sauce. Stir-fry for 4–5 minutes until the rice is steaming hot throughout. Fold in the eggs and sesame oil and serve immediately; do not reheat again.",
    ],
  }),
  dinner("baked-salmon", {
    title: "Baked salmon", cookTime: 30, servings: "4",
    ingredients: ["600 g salmon fillets, divided into 4 portions", "250 g dry couscous", "300 ml boiling water", "400 g broccoli florets", "1 lemon, sliced", "2 tbsp olive oil", "1 tsp dried dill", "0.75 tsp salt, divided", "0.25 tsp black pepper"],
    steps: [
      "Heat the oven to 200°C. Toss the broccoli with half the oil and half the salt on a baking tray. Roast for 10 minutes.",
      "Add the salmon beside the broccoli. Brush with the remaining oil, sprinkle with dill, remaining salt and pepper, and lay the lemon slices on top.",
      "Bake for 12–15 minutes until the salmon reaches 63°C in the thickest part and the broccoli is tender.",
      "Meanwhile, put the couscous in a heatproof bowl, pour over the boiling water and cover for 5 minutes. Fluff with a fork and serve with the salmon and broccoli.",
    ],
  }),
  dinner("chicken-stir-fry", {
    title: "Chicken stir-fry", cookTime: 30, servings: "4",
    ingredients: ["600 g chicken breast, thinly sliced", "250 g dry rice", "500 ml water", "2 bell peppers, sliced", "300 g broccoli florets", "2 cloves garlic, minced", "10 g fresh ginger, grated", "2 tbsp vegetable oil", "3 tbsp soy sauce", "1 tbsp honey", "1 tsp cornflour", "60 ml cold water"],
    steps: [
      "Rinse the rice, place in a saucepan with the 500 ml water and bring to a boil. Cover, simmer on low for 12–15 minutes, then remove from heat and leave covered for 5 minutes.",
      "Mix the soy sauce, honey, cornflour and 60 ml cold water in a small bowl.",
      "Heat half the oil in a large pan over high heat. Stir-fry the chicken in batches for 5–7 minutes until it reaches 74°C; transfer to a clean plate.",
      "Heat the remaining oil. Stir-fry the peppers and broccoli for 4–5 minutes, then add the garlic and ginger for 30 seconds.",
      "Return the chicken and any juices, add the sauce, and stir for 1–2 minutes until bubbling and thickened. Serve over the rice.",
    ],
  }),
  dinner("vegetable-omelet", {
    title: "Vegetable omelet", cookTime: 20, servings: "4",
    ingredients: ["8 eggs", "60 ml milk", "1 bell pepper, finely diced", "150 g mushrooms, sliced", "100 g spinach", "80 g cheddar cheese, grated", "2 tbsp olive oil", "0.5 tsp salt", "0.25 tsp black pepper", "4 slices wholemeal bread"],
    steps: [
      "Beat the eggs with the milk, salt and pepper. Heat half the oil in a nonstick frying pan over medium heat.",
      "Cook the pepper and mushrooms for 5–6 minutes. Add the spinach and stir for 1 minute until wilted; transfer the vegetables to a bowl.",
      "Make two omelets, each serving two: heat a little of the remaining oil, pour in half the egg mixture and gently draw the edges toward the centre for 2 minutes.",
      "Add half the vegetables and cheese to one side. Cover and cook on low for 2–3 minutes until the eggs are set with no runny areas, then fold. Repeat with the remaining ingredients.",
      "Toast the bread and serve each omelet cut in half with a slice of toast per person.",
    ],
  }),
  dinner("beef-tacos", {
    title: "Beef tacos", cookTime: 25, servings: "4",
    ingredients: ["500 g minced beef", "8 small tortillas", "1 onion, diced", "1 tbsp vegetable oil", "2 tsp ground cumin", "1 tsp paprika", "0.5 tsp salt", "100 ml water", "2 tomatoes, diced", "100 g lettuce, shredded", "80 g cheddar cheese, grated", "100 g plain yogurt"],
    steps: [
      "Heat the oil in a frying pan over medium heat. Cook the onion for 5 minutes until softened.",
      "Add the beef and cook for 7–8 minutes, breaking it apart, until browned and the meat reaches 71°C.",
      "Stir in the cumin, paprika, salt and water. Simmer for 5 minutes until most of the liquid has evaporated.",
      "Warm the tortillas according to their packet. Fill with beef, tomatoes, lettuce, cheese and yogurt, allowing two tacos per person.",
    ],
  }),
  dinner("lentil-soup", {
    title: "Lentil soup", cookTime: 40, servings: "4",
    ingredients: ["250 g dry red lentils, rinsed", "1 onion, diced", "2 carrots, diced", "2 cloves garlic, minced", "400 g canned chopped tomatoes", "1200 ml vegetable stock", "1 tbsp olive oil", "1 tsp ground cumin", "0.5 tsp salt", "0.25 tsp black pepper", "4 slices wholemeal bread"],
    steps: [
      "Heat the oil in a large saucepan over medium heat. Cook the onion and carrots for 6 minutes, stirring.",
      "Add the garlic and cumin and stir for 30 seconds.",
      "Add the lentils, tomatoes and stock. Bring to a boil, then reduce the heat and simmer partly covered for 20–25 minutes until the lentils and carrots are soft.",
      "Stir in the salt and pepper. If preferred, mash some lentils against the side of the pan to thicken the soup. Serve with the bread.",
    ],
  }),
  dinner("chicken-and-rice", {
    title: "Chicken and rice", cookTime: 40, servings: "4",
    ingredients: ["600 g boneless chicken thighs, cut into 3 cm pieces", "300 g dry long-grain rice, rinsed", "600 ml chicken stock", "1 onion, diced", "2 carrots, diced", "150 g frozen peas", "2 tbsp olive oil", "1 tsp paprika", "0.5 tsp salt", "0.25 tsp black pepper"],
    steps: [
      "Heat the oil in a wide lidded saucepan over medium-high heat. Brown the chicken for 5 minutes, turning; it will finish cooking with the rice.",
      "Add the onion and carrots and cook for 5 minutes. Stir in the paprika, salt, pepper and rice.",
      "Pour in the stock and bring to a boil. Cover, turn the heat to low and simmer for 15 minutes without stirring.",
      "Scatter the peas over the rice, cover and cook for 5 more minutes. Check the rice is tender and the chicken reaches 74°C; if needed, add a splash of water and cook covered for a few more minutes.",
      "Remove from the heat and rest covered for 5 minutes. Fluff gently before serving.",
    ],
  }),
  dinner("roasted-vegetables-with-potatoes", {
    title: "Roasted vegetables with potatoes", cookTime: 45, servings: "4",
    ingredients: ["800 g potatoes, cut into 2 cm cubes", "2 bell peppers, cut into chunks", "2 courgettes, thickly sliced", "1 red onion, cut into wedges", "480 g canned chickpeas, drained and rinsed", "3 tbsp olive oil", "1 tsp dried oregano", "1 tsp salt", "0.5 tsp black pepper", "150 g feta cheese, crumbled"],
    steps: [
      "Heat the oven to 220°C. Toss the potatoes with 1 tbsp oil and half the salt. Spread over two large baking trays and roast for 15 minutes.",
      "Mix the peppers, courgettes, onion and drained chickpeas with the remaining oil, salt, oregano and pepper.",
      "Divide the vegetables and chickpeas between the trays with the potatoes. Roast for 20–25 minutes, turning halfway, until the potatoes are tender and the vegetables are browned.",
      "Divide among four plates and sprinkle with the feta before serving.",
    ],
  }),
  dinner("homemade-pizza", {
    title: "Homemade pizza", cookTime: 35, servings: "4",
    ingredients: ["500 g ready-made pizza dough", "200 g tomato passata", "200 g mozzarella cheese, grated", "1 bell pepper, thinly sliced", "100 g mushrooms, thinly sliced", "1 tbsp olive oil", "1 tsp dried oregano", "0.25 tsp salt", "20 g plain flour, for dusting"],
    steps: [
      "Heat the oven to 240°C with two baking trays inside. Mix the passata with the oregano and salt.",
      "Dust the work surface with the flour. Divide the dough in half and stretch each piece into a thin 28 cm round on baking paper, following the dough packet's resting instructions if required.",
      "Spread each base with half the sauce, leaving a small border. Divide the mozzarella, pepper and mushrooms over the pizzas and drizzle with the oil.",
      "Carefully slide each pizza with its paper onto a hot tray. Bake for 12–15 minutes, swapping trays halfway, until the crust is golden and cooked through and the cheese is bubbling. Slice and serve.",
    ],
  }),
  dinner("pasta-with-mushrooms", {
    title: "Pasta with mushrooms", cookTime: 25, servings: "4",
    ingredients: ["400 g dried pasta", "500 g mushrooms, sliced", "1 onion, finely diced", "2 cloves garlic, minced", "200 ml single cream", "2 tbsp olive oil", "40 g Parmesan cheese, grated", "1 tsp salt, divided", "0.25 tsp black pepper", "10 g fresh parsley, chopped"],
    steps: [
      "Bring a large pot of water to a boil with half the salt. Cook the pasta according to the packet, about 10 minutes. Reserve 150 ml cooking water before draining.",
      "Meanwhile, heat the oil in a large frying pan over medium-high heat. Cook the onion for 3 minutes, then add the mushrooms and cook for 7–8 minutes until browned.",
      "Add the garlic and cook for 30 seconds. Reduce the heat, pour in the cream and add the remaining salt and pepper. Simmer gently for 2 minutes.",
      "Toss in the pasta and Parmesan, loosening with a little reserved cooking water as needed. Sprinkle with parsley and serve.",
    ],
  }),
];
