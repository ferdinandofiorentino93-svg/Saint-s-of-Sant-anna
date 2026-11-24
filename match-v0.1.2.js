import {
  createGame, startGame, getActiveStats, getPublicState,
  recruitFromHandToBench, substitute, playLegendary, playTactic, activateAbility as activateAbilityEngine,
  resolveShowdown, resolveShot, endPlayerTurn
} from "./engine-v0.1.2.js";
import { getCard, getAbilityRule, canAutomateTactic } from "./catalog-v0.1.2.js";
import { makeGameConfig } from "./game-config-v0.1.2.js";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const rollD20 = () => 1 + Math.floor(Math.random() * 20);
const rollD6 = () => 1 + Math.floor(Math.random() * 6);

export class LocalMatch {
  constructor({ mode = "cpu", onUpdate = () => {} } = {}) {
    this.mode = mode;
    this.onUpdate = onUpdate;
    this.humanId = "human";
    this.cpuId = "cpu";
    this.busy = false;
    this.log = [];
    const config = makeGameConfig({
      humanId: this.humanId,
      cpuId: this.cpuId,
      humanName: "La tua squadra",
      cpuName: mode === "training" ? "Allenatore" : "Computer"
    });
    this.state = startGame(createGame(config));
    this.pushLog(`La partita comincia: ${this.state.players[0].name} contro ${this.state.players[1].name}.`);
    this.sync();
  }

  get human() { return this.state.players.find(p => p.id === this.humanId); }
  get cpu() { return this.state.players.find(p => p.id === this.cpuId); }
  get isHumanTurn() { return this.state.status === "active" && this.state.activePlayerId === this.humanId && !this.busy; }
  get active() { return this.state.players.find(p => p.id === this.state.activePlayerId); }

  pushLog(message) {
    this.log.unshift(message);
    this.log = this.log.slice(0, 12);
  }

  sync() { this.onUpdate(this); }

  update(state, message) {
    this.state = state;
    if (message) this.pushLog(message);
    this.sync();
    if (this.state.status === "active" && this.state.activePlayerId === this.cpuId) this.runCpuTurn();
  }

  recruit(cardId) {
    if (!this.isHumanTurn) return;
    const card = getCard(cardId);
    this.update(recruitFromHandToBench(this.state, this.humanId, cardId), `${card?.name ?? cardId} entra in panchina.`);
  }

  changePlayer(fieldUnitId, benchUnitId) {
    if (!this.isHumanTurn) return;
    const outgoing = this.human.field.find(u => u.instanceId === fieldUnitId);
    const incoming = this.human.bench.find(u => u.instanceId === benchUnitId);
    this.update(substitute(this.state, this.humanId, fieldUnitId, benchUnitId), `Sostituzione: ${outgoing?.name} lascia il campo, entra ${incoming?.name}.`);
  }

  upgrade(legendaryId, fieldUnitId) {
    if (!this.isHumanTurn) return;
    const card = getCard(legendaryId);
    this.update(playLegendary(this.state, this.humanId, legendaryId, fieldUnitId), `${card?.name} sale in versione Leggendaria.`);
  }

  playTactic(cardId) {
    if (!this.isHumanTurn) return;
    const card = getCard(cardId);
    if (!canAutomateTactic(card)) throw new Error("Questa tattica è catalogata, ma il suo effetto non è ancora automatizzato nel prototipo.");
    this.update(playTactic(this.state, this.humanId, cardId), `Tattica giocata: ${card.name}.`);
  }

  activateAbility(unitId, abilityIndex, params = {}) {
    if (!this.isHumanTurn) return;
    const unit = this.human.field.find(u => u.instanceId === unitId);
    const cardId = unit?.legendaryOverlay?.cardId ?? unit?.cardId;
    const rule = getAbilityRule(cardId, abilityIndex);
    const roll = rule?.die === 20 ? rollD20() : rule?.die === 6 ? rollD6() : undefined;
    const next = activateAbilityEngine(this.state, this.humanId, unitId, abilityIndex, { ...params, ...(roll ? { roll } : {}) });
    const result = next.lastAbility;
    const card = getCard(cardId);
    const ability = card?.abilities?.[abilityIndex];
    const detail = result?.roll ? ` · D${rule.die}: ${result.roll}` : '';
    const cost = result?.cost != null ? ` · costo ${result.cost} Fatica` : '';
    this.update(next, `${ability?.name ?? 'Abilità'} attivata${detail}${cost}${result?.outcome ? ` · ${result.outcome}` : ''}.`);
  }

  showdown() {
    if (!this.isHumanTurn) return;
    const before = this.state.players.find(p => p.id !== this.humanId).nextShowdownBonus;
    const next = resolveShowdown(this.state, this.humanId);
    const s = next.lastShowdown;
    const verdict = s.difference > 0 ? "Showdown vinto" : s.difference < 0 ? "Showdown perso" : "Showdown in parità";
    this.update(next, `${verdict}: Attacco ${s.attackTotal}${s.passiveAttackBonus ? ` (incluso +${s.passiveAttackBonus} di Dominio Assoluto)` : ''} · Difesa ${s.defenseTotal} · differenza ${s.difference > 0 ? "+" : ""}${s.difference}. Bonus Showdown +${s.defenderBonus} assegnato al difensore per la sua prossima azione offensiva.`);
  }

  shot(shooterUnitId) {
    if (!this.isHumanTurn) return;
    const result = resolveShot(this.state, {
      attackingPlayerId: this.humanId,
      shooterUnitId,
      shotRoll: rollD20(),
      goalkeeperRoll: rollD20()
    });
    const s = result.lastShot;
    const extras = s.automaticEffects?.length ? ` Abilità automatiche: ${s.automaticEffects.join('; ')}.` : '';
    this.update(result, `${s.result === "goal" ? "GOL!" : "PARATA!"} Tiro ${s.shotTotal} contro Parata ${s.saveTotal}.${extras}`);
  }

  endTurn() {
    if (!this.isHumanTurn) return;
    const next = endPlayerTurn(this.state, this.humanId);
    this.update(next, "Hai concluso il tuo turno.");
  }

  async runCpuTurn() {
    if (this.busy || this.state.status !== "active" || this.state.activePlayerId !== this.cpuId) return;
    this.busy = true;
    this.sync();
    await wait(500);
    try {
      // La CPU usa le stesse funzioni del motore: recluta, può fare Rank Up,
      // gioca solo tattiche con effetto strutturato e risolve Showdown/Tiro.
      const cpu = this.cpu;
      const recruitId = cpu.hand.find(id => {
        const c = getCard(id);
        return c?.type === "player" && c.version === "Comune" && c.enginePlayable;
      });
      if (recruitId && cpu.bench.length < 5) {
        this.state = recruitFromHandToBench(this.state, this.cpuId, recruitId);
        this.pushLog(`${getCard(recruitId).name} entra nella panchina del Computer.`);
        this.sync();
      }
      const legendaryId = cpu.hand.find(id => getCard(id)?.version === "Leggendaria");
      if (legendaryId) {
        const legendary = getCard(legendaryId);
        const baseUnit = cpu.field.find(u => u.cardId === legendary.baseCardId && !u.legendaryOverlay);
        if (baseUnit && cpu.substitutionsRemaining >= 2) {
          this.state = playLegendary(this.state, this.cpuId, legendaryId, baseUnit.instanceId);
          this.pushLog(`Il Computer schiera ${legendary.name} Leggendario.`);
          this.sync();
        }
      }
      const tacticId = this.cpu.hand.find(id => canAutomateTactic(getCard(id)));
      if (tacticId && !cpu.turnFlags.showdownResolved) {
        this.state = playTactic(this.state, this.cpuId, tacticId);
        this.pushLog(`Il Computer gioca ${getCard(tacticId).name}.`);
        this.sync();
      }
      if (!this.cpu.turnFlags.showdownResolved) {
        this.state = resolveShowdown(this.state, this.cpuId);
        const s = this.state.lastShowdown;
        this.pushLog(`Showdown del Computer: ${s.attackTotal} contro ${s.defenseTotal}.`);
        this.sync();
      }
      if (this.mode !== "training" && !this.cpu.turnFlags.shotResolved) {
        const shooter = this.cpu.field
          .filter(u => u.role !== "goalkeeper")
          .sort((a,b) => getActiveStats(b).technique - getActiveStats(a).technique)[0];
        if (shooter) {
          this.state = resolveShot(this.state, {
            attackingPlayerId: this.cpuId,
            shooterUnitId: shooter.instanceId,
            shotRoll: rollD20(),
            goalkeeperRoll: rollD20()
          });
          const s = this.state.lastShot;
          this.pushLog(`Il Computer conclude: ${s.result === "goal" ? "GOL" : "PARATA"} (${s.shotTotal}–${s.saveTotal}).`);
          this.sync();
        }
      } else if (this.mode === "training") {
        this.pushLog("Allenamento: il Computer non tenta il tiro, così puoi esercitarti sulle azioni.");
      }
      await wait(450);
      this.state = endPlayerTurn(this.state, this.cpuId);
      this.pushLog("Il Computer ha concluso il turno.");
    } catch (error) {
      this.pushLog(`Azione CPU non eseguita: ${error.message}`);
      if (this.state.status === "active" && this.state.activePlayerId === this.cpuId) {
        this.state = endPlayerTurn(this.state, this.cpuId);
      }
    } finally {
      this.busy = false;
      this.sync();
      if (this.state.status === "active" && this.state.activePlayerId === this.cpuId) this.runCpuTurn();
    }
  }
}
