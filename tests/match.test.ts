import { describe, expect, it } from "vitest";
import { checkGuess, isMatch, normalize } from "../src/lib/match";

describe("normalize", () => {
  it("ignore casse, accents, ponctuation et décorations", () => {
    expect(normalize("Désenchantée")).toBe("desenchantee");
    expect(normalize("Hey Jude (Remastered 2015)")).toBe("hey jude");
    expect(normalize("Despacito - Remix")).toBe("despacito");
    expect(normalize("Get Lucky (feat. Pharrell Williams)")).toBe("get lucky");
    expect(normalize("The Beatles")).toBe("beatles");
    expect(normalize("Simon & Garfunkel")).toBe("simon and garfunkel");
    expect(normalize("L'Aventurier")).toBe("aventurier");
  });
});

describe("isMatch", () => {
  it("accepte les réponses exactes à la casse/accents près", () => {
    expect(isMatch("desenchantee", "Désenchantée")).toBe(true);
    expect(isMatch("MYLENE FARMER", "Mylène Farmer")).toBe(true);
  });
  it("tolère les petites fautes de frappe", () => {
    expect(isMatch("bohemian rapsody", "Bohemian Rhapsody")).toBe(true);
    expect(isMatch("Stromea", "Stromae")).toBe(true);
    expect(isMatch("orelsen", "Orelsan")).toBe(true);
    expect(isMatch("Beyonce", "Beyoncé")).toBe(true);
  });
  it("refuse les réponses trop approximatives", () => {
    expect(isMatch("bohemian", "Bohemian Rhapsody")).toBe(false);
    expect(isMatch("queen", "Bohemian Rhapsody")).toBe(false);
    expect(isMatch("hell", "Hello")).toBe(true); // une faute sur 5 lettres
    expect(isMatch("help", "Hello")).toBe(false);
    expect(isMatch("a", "U2")).toBe(false);
    expect(isMatch("u3", "U2")).toBe(false);
    expect(isMatch("e", "Eminem")).toBe(false);
  });
  it("accepte les alias", () => {
    expect(isMatch("acdc", "AC/DC")).toBe(true);
    expect(isMatch("ac dc", "AC/DC")).toBe(true);
    expect(isMatch("paul van haver", "Stromae", ["Paul Van Haver"])).toBe(true);
  });
  it("accepte « the » optionnel, & / and / et", () => {
    expect(isMatch("the weeknd", "The Weeknd")).toBe(true);
    expect(isMatch("weeknd", "The Weeknd")).toBe(true);
    expect(isMatch("simon and garfunkel", "Simon & Garfunkel")).toBe(true);
    expect(isMatch("simon et garfunkel", "Simon & Garfunkel")).toBe(true);
  });
  it("trouve la réponse à l'intérieur d'une saisie complète", () => {
    const track = { title: "One More Time", artist: "Daft Punk" };
    expect(checkGuess("Daft Punk - One More Time", track)).toEqual({ title: true, artist: true });
    expect(checkGuess("daft pank one mor time", track)).toEqual({ title: true, artist: true });
    expect(checkGuess("c'est daft punk", track)).toEqual({ title: false, artist: true });
    expect(checkGuess("one more", track)).toEqual({ title: false, artist: false });
  });
  it("les mots courts dans une phrase doivent être exacts", () => {
    expect(checkGuess("c'est u2 je crois", { title: "One", artist: "U2" }).artist).toBe(true);
    expect(checkGuess("c'est u3", { title: "One", artist: "U2" }).artist).toBe(false);
  });
});
