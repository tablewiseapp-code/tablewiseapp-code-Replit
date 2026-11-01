// Isolated design fixture: real development ingredient text; no API, storage, or DB writes.
export interface PlannerRecipe {id:string; title:string; ingredients:string[]}
export const exampleRecipes:PlannerRecipe[] = [
  {
    "id": "tablewise:real:v1:chicken-curry",
    "title": "Easy chicken curry",
    "ingredients": [
      "2 tbsp sunflower oil",
      "1 onion, thinly sliced",
      "2 garlic cloves, crushed",
      "1 thumb-sized piece ginger, grated",
      "6 boneless skinless chicken thighs",
      "3 tbsp medium curry paste",
      "400 g canned chopped tomatoes",
      "100 g Greek yogurt",
      "1 small bunch coriander, chopped",
      "50 g ground almonds",
      "Salt, to taste",
      "Naan bread or cooked basmati rice, optional, to serve"
    ]
  },
  {
    "id": "tablewise:real:v1:salmon-egg-fried-rice",
    "title": "Salmon egg-fried rice",
    "ingredients": [
      "1 thumb-sized piece ginger, grated",
      "1–2 garlic cloves, grated",
      "2 tbsp low-salt soy sauce",
      "0.5 tbsp rice wine vinegar",
      "2 tbsp vegetable oil",
      "1 large carrot, chopped",
      "175 g baby corn and mangetout, chopped",
      "2 skinless smoked salmon fillets",
      "250 g pouch cooked brown basmati rice",
      "2 eggs",
      "Hot sauce, optional, to serve"
    ]
  },
  {
    "id": "tablewise:real:v1:lentil-leek-soup",
    "title": "Red lentil, carrot and leek soup",
    "ingredients": [
      "2 litres vegetable stock",
      "150 g red lentils",
      "6 carrots, finely chopped",
      "2 medium leeks, sliced (about 300 g)",
      "1 small handful parsley, chopped",
      "Salt and black pepper, to taste"
    ]
  }
];
export const examplePlan = {filters:{},selectedIds:exampleRecipes.map(r=>r.id),expandedSections:[],showMoreFilters:false,planAssignments:exampleRecipes.map((recipe,index)=>({recipeId:recipe.id,mealType:'Dinner' as const,startDay:index,spanDays:1}))};
const translations:Record<string,string> = {
  "grocery.title": "Your Grocery List",
  "grocery.groceryList": "Grocery List",
  "grocery.items": "{total} items from {recipes} recipes",
  "grocery.checked": "{checked} of {total} items checked",
  "grocery.uncheckAll": "Uncheck all",
  "grocery.backToPlan": "← Back to Weekly Plan",
  "grocery.noMeals": "No meals planned yet",
  "grocery.goToPlan": "Go to Weekly Plan",
  "grocery.produce": "Produce",
  "grocery.meatPoultry": "Meat & Poultry",
  "grocery.seafood": "Seafood",
  "grocery.dairyEggs": "Dairy & Eggs",
  "grocery.grainsPasta": "Grains & Pasta",
  "grocery.cannedJarred": "Canned & Jarred",
  "grocery.spicesSeasonings": "Spices & Seasonings",
  "grocery.other": "Other"
};
export function useI18n(){return {t:(key:string,params?:Record<string,unknown>)=>Object.entries(params||{}).reduce((text,[name,value])=>text.replace('{'+name+'}',String(value)),translations[key]||key)}}
export function useLocation(){return ['/grocery-list',(_path:string)=>window.alert('This is a design-only preview. Your weekly planner and saved meals are unchanged.')] as const}
export async function fetchRecipes(){if(new URLSearchParams(window.location.search).get('state')==='error')throw new Error('Preview error state');return exampleRecipes}
export function toPlannerRecipes(recipes:PlannerRecipe[]){return recipes}
