// Enemy decision-making for Saltline Brawl.
//
// The engine calls chooseEnemyIntent() for every enemy a couple of times per
// second and then carries out whatever intent comes back. This one function
// decides how the whole game *feels*: fair or cheap, tense or sleepy.
//
// info = {
//   self: {
//     type,            // 'thug' | 'runner' | 'bruiser' | 'boss'
//     hpRatio,         // 0..1 remaining health
//     distX, distY,    // absolute distance to the player along the street / in depth
//     inRange,         // true if an attack started right now could connect
//     cooldown,        // seconds until this enemy may attack again (0 = ready)
//   },
//   player: {
//     hpRatio,         // 0..1
//     isDown,          // knocked down or getting up (invulnerable - attacks will whiff)
//     isAttacking,     // mid-swing
//     isAirborne,      // jumping
//   },
//   attackersNow,      // how many OTHER enemies are currently pressing the attack
//   alliesAlive,       // how many other enemies are alive
// }
//
// Return one of:
//   'attack'   - close in and swing as soon as in range
//   'circle'   - hover at mid distance, looking for an opening
//   'retreat'  - back away from the player
//   'approach' - walk up next to the player without swinging

// TODO(you): this is a deliberately plain baseline. Make it yours — see the
// notes in the chat for the trade-offs worth thinking about.
function chooseEnemyIntent(info) {
  const { self, player, attackersNow } = info;

  if (player.isDown) return 'circle';            // don't crowd a downed player
  if (self.type === 'boss') return 'attack';     // the boss never waits its turn
  if (self.cooldown > 0) return 'circle';        // just swung: back off a little
  if (attackersNow >= 2) return 'circle';        // at most two attackers at once
  return 'attack';
}

window.BrawlAI = { chooseEnemyIntent };
