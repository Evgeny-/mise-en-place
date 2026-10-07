import { DISHES, MENUS, type Menu } from '../src/core/content';

/**
 * The Trattoria menu of the design simulations (three preps, four dishes), registered as its own
 * menu so the parity tests keep checking the engine against the Python numbers. The game's menu has
 * grown since (a potato next to flour now makes gnocchi dough).
 */
export const CLASSIC: Menu = {
  id: 'trattoria-classic',
  items: ['tomato', 'onion', 'carrot', 'potato', 'cheese', 'egg', 'flour', 'pasta', 'mushroom', 'sauce', 'dough', 'soffritto'],
  preps: [
    { out: 'sauce', from: ['tomato', 'tomato'] },
    { out: 'dough', from: ['flour', 'egg'] },
    { out: 'soffritto', from: ['onion', 'carrot'] },
  ],
  dishes: [DISHES.pizza, DISHES.spaghetti, DISHES.minestrone, DISHES.omelette],
};
MENUS[CLASSIC.id] = CLASSIC;
