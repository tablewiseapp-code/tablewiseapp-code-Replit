import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  CookingPot,
  Leaf,
  Plus,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import "./dinnerflow.css";

type Recipe = {
  id: string;
  title: string;
  note: string;
  time: number;
  servings: number;
  tag: string;
  tone: string;
  ingredients: string[];
};

const recipes: Recipe[] = [
  { id: "salmon", title: "Miso-glazed salmon bowls", note: "Ginger rice · cucumber · sesame", time: 28, servings: 4, tag: "Seafood", tone: "salmon", ingredients: ["Salmon fillets", "White miso", "Cucumber", "Jasmine rice", "Fresh ginger", "Sesame seeds"] },
  { id: "tomato", title: "Slow tomato & butter beans", note: "Sourdough · torn basil · lemon", time: 35, servings: 4, tag: "Plant-forward", tone: "tomato", ingredients: ["Butter beans", "Cherry tomatoes", "Sourdough", "Fresh basil", "Lemon", "Olive oil"] },
  { id: "chicken", title: "Crispy lemon chicken", note: "Warm potatoes · dill yoghurt", time: 42, servings: 4, tag: "Family favorite", tone: "chicken", ingredients: ["Chicken thighs", "Baby potatoes", "Greek yoghurt", "Fresh dill", "Lemon", "Garlic"] },
  { id: "noodles", title: "Sesame peanut noodles", note: "Charred broccoli · chili crunch", time: 22, servings: 2, tag: "Quick supper", tone: "noodles", ingredients: ["Rice noodles", "Broccoli", "Peanut butter", "Soy sauce", "Lime", "Chili crisp"] },
  { id: "tacos", title: "Smoky mushroom tacos", note: "Avocado · pickled red onion", time: 30, servings: 3, tag: "Meatless", tone: "tacos", ingredients: ["Portobello mushrooms", "Corn tortillas", "Avocado", "Red onion", "Lime", "Smoked paprika"] },
];

const days = [
  { key: "Mon", date: "14", label: "Monday" },
  { key: "Tue", date: "15", label: "Tuesday" },
  { key: "Wed", date: "16", label: "Wednesday" },
  { key: "Thu", date: "17", label: "Thursday" },
  { key: "Fri", date: "18", label: "Friday" },
  { key: "Sat", date: "19", label: "Saturday" },
  { key: "Sun", date: "20", label: "Sunday" },
];

const initialPlan: Record<string, string | null> = {
  Mon: "tomato",
  Tue: null,
  Wed: "salmon",
  Thu: null,
  Fri: "tacos",
  Sat: null,
  Sun: null,
};

const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

export function DinnerFlow() {
  const [plan, setPlan] = useState(initialPlan);
  const [activeDay, setActiveDay] = useState("Tue");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All ideas");
  const [screen, setScreen] = useState<"plan" | "shop">("plan");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const plannedIds = Object.values(plan).filter((id): id is string => Boolean(id));
  const planned = plannedIds.map((id) => recipeById.get(id)).filter((item): item is Recipe => Boolean(item));
  const ingredients = useMemo(() => {
    const unique = new Map<string, string>();
    planned.forEach((recipe) => recipe.ingredients.forEach((ingredient) => unique.set(ingredient.toLowerCase(), ingredient)));
    return [...unique.values()];
  }, [planned]);
  const matching = recipes.filter((recipe) => {
    const searchMatch = `${recipe.title} ${recipe.note} ${recipe.tag}`.toLowerCase().includes(query.toLowerCase());
    return searchMatch && (filter === "All ideas" || recipe.tag === filter);
  });

  const assignRecipe = (recipeId: string) => {
    setPlan((current) => ({ ...current, [activeDay]: recipeId }));
    setConfirmed(false);
  };
  const removeRecipe = (day: string) => {
    setPlan((current) => ({ ...current, [day]: null }));
    setConfirmed(false);
  };
  const resetWeek = () => {
    setPlan(Object.fromEntries(days.map((day) => [day.key, null])));
    setConfirmed(false);
  };

  return (
    <div className="df-app">
      <aside className="df-rail">
        <div className="df-brand">
          <span className="df-brandmark"><CookingPot size={19} strokeWidth={1.8} /></span>
          <span>tablewise<span className="df-brand-dot">.</span></span>
        </div>
        <div className="df-household">
          <div className="df-avatar">M</div>
          <div><strong>Mara’s kitchen</strong><small>Personal cookbook</small></div>
          <ChevronDown size={15} />
        </div>
        <p className="df-nav-label">YOUR KITCHEN</p>
        <nav className="df-nav">
          <button className={`df-navitem ${screen === "plan" ? "is-active" : ""}`} onClick={() => setScreen("plan")}><CalendarDays size={17} /> My week <span className="df-nav-count">{planned.length}</span></button>
          <button className={`df-navitem ${screen === "shop" ? "is-active" : ""}`} onClick={() => setScreen("shop")}><ShoppingBasket size={17} /> Shopping list <span className="df-nav-count">{ingredients.length}</span></button>
          <button className="df-navitem" onClick={() => { setScreen("plan"); setQuery(""); }}><CookingPot size={17} /> Recipe box <ArrowRight size={14} className="df-nav-tail" /></button>
        </nav>
        <div className="df-rail-bottom">
          <div className="df-tip"><Sparkles size={15} /><span><b>A little rhythm</b><br />Leave one night open. Plans change.</span></div>
          <button className="df-profile"><span className="df-profile-avatar">MR</span><span><b>Mara Reed</b><small>Home cook</small></span><ChevronDown size={14} /></button>
        </div>
      </aside>

      <main className="df-main">
        <header className="df-topbar">
          <div className="df-breadcrumb"><span>My kitchen</span><span className="df-slash">/</span><b>{screen === "plan" ? "Weekly plan" : "Shopping list"}</b></div>
          <div className="df-top-right"><span className="df-save-state"><i /> Saved just now</span><button className="df-help" aria-label="Help">?</button></div>
        </header>

        {screen === "plan" ? (
          <div className="df-content">
            <section className="df-heading">
              <div>
                <div className="df-overline"><span>WEEK 42</span><span className="df-overline-line" /><span>OCT 14 — 20</span></div>
                <h1>Make room for <em>good dinners.</em></h1>
                <p>A few lovely ideas for the week ahead. Keep what fits, swap what doesn’t.</p>
              </div>
              <div className="df-week-controls"><button aria-label="Previous week"><ArrowLeft size={16} /></button><button aria-label="Next week"><ArrowRight size={16} /></button><button className="df-today">This week</button></div>
            </section>

            <section className="df-week-story">
              <div className="df-week-summary">
                <div className="df-summary-top"><span className="df-summary-kicker">YOUR DINNER LINEUP</span><span className="df-summary-mark"><Leaf size={15} /></span></div>
                <div className="df-count"><strong>{planned.length}</strong><span>of 7<br />nights planned</span></div>
                <div className="df-progress"><i style={{ width: `${(planned.length / 7) * 100}%` }} /></div>
                <p>{planned.length < 5 ? "A bit of breathing room, built right in." : "A week full of things to look forward to."}</p>
                <div className="df-summary-stats"><span><Clock3 size={14} /> {planned.length ? Math.round(planned.reduce((sum, recipe) => sum + recipe.time, 0) / planned.length) : 0} min avg</span><span><Users size={14} /> 4 at the table</span></div>
              </div>
              <div className="df-itinerary">
                <div className="df-itinerary-head"><span>THE WEEK, AT A GLANCE</span><span className="df-open-night"><i /> open night</span></div>
                <div className="df-day-list">
                  {days.map((day) => {
                    const recipe = plan[day.key] ? recipeById.get(plan[day.key]!) : null;
                    return (
                      <button key={day.key} className={`df-day ${activeDay === day.key ? "is-selected" : ""} ${recipe ? "has-recipe" : ""}`} onClick={() => setActiveDay(day.key)}>
                        <span className="df-day-date"><b>{day.key}</b><i>{day.date}</i></span>
                        {recipe ? (
                          <span className="df-day-recipe"><span className={`df-mini-art ${recipe.tone}`}><span>{recipe.title.split(" ").slice(0, 2).map((word) => word[0]).join("")}</span></span><span className="df-day-copy"><b>{recipe.title}</b><small>{recipe.time} min · dinner</small></span><span className="df-day-check"><Check size={13} /></span></span>
                        ) : (
                          <span className="df-day-empty"><span className="df-add-dot"><Plus size={13} /></span><span><b>{day.key === "Tue" ? "Choose a dinner" : "Leave it open"}</b><small>{day.key === "Tue" ? "Pick an idea below" : "Tap to plan this night"}</small></span></span>
                        )}
                        {recipe && <span className="df-remove" onClick={(event) => { event.stopPropagation(); removeRecipe(day.key); }} aria-label={`Remove ${recipe.title}`}><X size={13} /></span>}
                      </button>
                    );
                  })}
                </div>
                <div className="df-itinerary-foot"><span><span className="df-foot-line" /> A plan can change. Yours is saved as you go.</span><button onClick={resetWeek}>Clear week</button></div>
              </div>
            </section>

            <section className="df-ideas">
              <div className="df-ideas-heading">
                <div><div className="df-overline df-overline-small"><span>THE RECIPE BOX</span><span className="df-overline-line" /><span>5 IDEAS</span></div><h2>What sounds good?</h2></div>
                <div className="df-ideas-controls">
                  <label className="df-search"><Search size={16} /><input aria-label="Search recipes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a recipe" /><kbd>⌘ K</kbd></label>
                  <button className="df-filter" onClick={() => setFilter((current) => current === "All ideas" ? "Plant-forward" : current === "Plant-forward" ? "Quick supper" : "All ideas")}><SlidersHorizontal size={15} /> {filter} <ChevronDown size={14} /></button>
                </div>
              </div>
              <div className="df-assign-note"><span className="df-assign-icon"><CalendarDays size={14} /></span><span>Adding to <b>{days.find((day) => day.key === activeDay)?.label}</b></span><span className="df-note-divider" /><button onClick={() => {
                const next = days[(days.findIndex((day) => day.key === activeDay) + 1) % days.length];
                setActiveDay(next.key);
              }}>Choose another night <ArrowRight size={13} /></button></div>
              {matching.length ? <div className="df-recipe-grid">
                {matching.map((recipe, index) => {
                  const alreadyPlanned = plannedIds.includes(recipe.id);
                  return (
                    <article key={recipe.id} className={`df-recipe-card ${recipe.tone}`} style={{ animationDelay: `${index * 60}ms` }}>
                      <div className={`df-recipe-art ${recipe.tone}`}><div className="df-art-orbit" /><span className="df-art-initial">{recipe.title.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span className="df-recipe-tag">{recipe.tag}</span></div>
                      <div className="df-recipe-body">
                        <h3>{recipe.title}</h3><p>{recipe.note}</p>
                        <div className="df-recipe-meta"><span><Clock3 size={13} /> {recipe.time} min</span><span><Users size={13} /> Serves {recipe.servings}</span></div>
                        <button className={`df-add-recipe ${alreadyPlanned ? "is-added" : ""}`} onClick={() => assignRecipe(recipe.id)}><span>{alreadyPlanned ? <Check size={15} /> : <Plus size={15} />}</span>{alreadyPlanned ? "Swap into this night" : "Add to this night"}<ArrowRight size={14} /></button>
                      </div>
                    </article>
                  );
                })}
              </div> : <div className="df-no-results"><Search size={19} /><b>No recipes found</b><span>Try a different search or reset the filter.</span><button onClick={() => { setQuery(""); setFilter("All ideas"); }}>Show all ideas</button></div>}
            </section>
            <footer className="df-plan-footer"><span>TABLEWISE <i>·</i> A thoughtful week starts here.</span><button className={confirmed ? "is-confirmed" : ""} onClick={() => setConfirmed((value) => !value)}>{confirmed ? <><Check size={16} /> Week feels good</> : <>Confirm this week <ArrowRight size={15} /></>}</button></footer>
          </div>
        ) : (
          <div className="df-content df-shopping">
            <section className="df-heading">
              <div><div className="df-overline"><span>THE USEFUL BIT</span><span className="df-overline-line" /><span>WEEK OF OCT 14</span></div><h1>One list. <em>Less wandering.</em></h1><p>Ingredients from your dinner lineup, brought together for the shop.</p></div>
              <button className="df-back-plan" onClick={() => setScreen("plan")}><ArrowLeft size={15} /> Back to your week</button>
            </section>
            <div className="df-shopping-layout">
              <section className="df-shopping-list">
                <div className="df-shopping-head"><div><span className="df-summary-kicker">YOUR SHOPPING LIST</span><h2>{ingredients.length - checked.size} things left</h2></div><button onClick={() => setChecked(new Set())}>Clear checked</button></div>
                <div className="df-shop-progress"><span style={{ width: `${ingredients.length ? checked.size / ingredients.length * 100 : 0}%` }} /></div>
                <div className="df-shop-items">
                  {ingredients.length ? ingredients.map((ingredient) => {
                    const done = checked.has(ingredient);
                    return <label key={ingredient} className={`df-shop-item ${done ? "is-checked" : ""}`}><input type="checkbox" checked={done} onChange={() => setChecked((current) => { const next = new Set(current); done ? next.delete(ingredient) : next.add(ingredient); return next; })} /><span className="df-custom-check">{done && <Check size={12} />}</span><span>{ingredient}</span></label>;
                  }) : <div className="df-shop-empty"><ShoppingBasket size={22} /><b>Your list is waiting for dinner.</b><span>Add a recipe to your week to gather its ingredients here.</span><button onClick={() => setScreen("plan")}>Browse dinner ideas <ArrowRight size={14} /></button></div>}
                </div>
                {ingredients.length > 0 && <div className="df-list-foot"><span>{checked.size} of {ingredients.length} items picked up</span><button onClick={() => setChecked(new Set(ingredients))}>Mark all as done</button></div>}
              </section>
              <aside className="df-shop-aside"><span className="df-summary-kicker">ON THE MENU</span><h3>These dinners made this list.</h3><div className="df-shop-recipes">{days.filter((day) => plan[day.key]).map((day) => {
                const recipe = recipeById.get(plan[day.key]!);
                if (!recipe) return null;
                return <div key={day.key} className="df-shop-recipe"><span className={`df-mini-art ${recipe.tone}`}><span>{recipe.title.split(" ").slice(0, 2).map((word) => word[0]).join("")}</span></span><span><small>{day.label}</small><b>{recipe.title}</b></span></div>;
              })}{!planned.length && <p className="df-empty-menu">No dinners in the lineup yet.</p>}</div><button className="df-edit-menu" onClick={() => setScreen("plan")}>Edit dinner lineup <ArrowRight size={14} /></button></aside>
            </div>
            <footer className="df-plan-footer"><span>TABLEWISE <i>·</i> Good food, gathered.</span><span className="df-save-state"><i /> List saved as you go</span></footer>
          </div>
        )}
      </main>
    </div>
  );
}

export default DinnerFlow;
