import type {
  DecodedIngredient,
  FunctionalClass,
  ProcessingClassification,
  QuidAuditResult,
  StatutoryWarningTrigger,
} from './types.js';

interface AdditiveInfo {
  name: string;
  category: 'BASE_FOOD' | 'ADDED_SUGAR' | 'HIGH_GI_CARB' | 'FAT_OIL' | 'ADDITIVE';
  functionalClass: FunctionalClass;
  processingGroup: ProcessingClassification;
  facts: string;
  whyFlagged?: string;
  isWarning: boolean;
  statutoryWarning?: string;
  allergenTags?: string[];
}

export class IngredientParser {
  // ---------------------------------------------------------------------------
  // 1. Authoritative Codex / FSSAI INS Additive & Chemical Knowledge Base
  // ---------------------------------------------------------------------------
  private static readonly INS_REGISTRY: Record<string, AdditiveInfo> = {
    // Synthetic Colours
    '102': {
      name: 'INS 102 (Tartrazine)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic lemon yellow azo dye used for food coloration.',
      whyFlagged: 'Synthetic azo colour; some individuals may be sensitive. This is not a diagnosis.',
      isWarning: true,
    },
    '110': {
      name: 'INS 110 (Sunset Yellow FCF)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic orange azo dye used for food coloration.',
      whyFlagged: 'Synthetic azo colour; some individuals may be sensitive. This is not a diagnosis.',
      isWarning: true,
    },
    '122': {
      name: 'INS 122 (Azorubine / Carmoisine)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic red azo food dye.',
      whyFlagged: 'Synthetic azo colour; sensitive individuals may react.',
      isWarning: true,
    },
    '124': {
      name: 'INS 124 (Ponceau 4R)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic strawberry red azo dye.',
      whyFlagged: 'Synthetic azo colour; sensitive individuals may react.',
      isWarning: true,
    },
    '127': {
      name: 'INS 127 (Erythrosine)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic cherry-pink fluorone food dye.',
      whyFlagged: 'Synthetic colour subject to strict FSSAI statutory limits.',
      isWarning: true,
    },
    '129': {
      name: 'INS 129 (Allura Red AC)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic dark red azo dye.',
      whyFlagged: 'Synthetic azo colour; sensitive individuals may react.',
      isWarning: true,
    },
    '132': {
      name: 'INS 132 (Indigotine / Indigo Carmine)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic blue dye derived from indigo.',
      isWarning: true,
    },
    '133': {
      name: 'INS 133 (Brilliant Blue FCF)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic reddish-blue triphenylmethane dye.',
      isWarning: true,
    },
    '150a': {
      name: 'INS 150a (Plain Caramel)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Caramel color prepared by controlled heat treatment of carbohydrates.',
      isWarning: false,
    },
    '150d': {
      name: 'INS 150d (Caramel IV - Sulfite Ammonia Caramel)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Caramel color prepared by controlled heat treatment with sulfite and ammonium compounds.',
      isWarning: false,
    },
    '160a': {
      name: 'INS 160a (Beta-Carotenes)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
      facts: 'Plant-derived orange/yellow provitamin A carotenoid pigment.',
      isWarning: false,
    },
    '171': {
      name: 'INS 171 (Titanium Dioxide)',
      category: 'ADDITIVE',
      functionalClass: 'COLOUR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Inorganic white mineral pigment.',
      isWarning: true,
    },

    // Preservatives
    '200': {
      name: 'INS 200 (Sorbic Acid)',
      category: 'ADDITIVE',
      functionalClass: 'PRESERVATIVE',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Antimicrobial food preservative active against molds and yeasts.',
      isWarning: false,
    },
    '202': {
      name: 'INS 202 (Potassium Sorbate)',
      category: 'ADDITIVE',
      functionalClass: 'PRESERVATIVE',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Widely used Class II food preservative inhibiting fungal growth.',
      isWarning: false,
    },
    '211': {
      name: 'INS 211 (Sodium Benzoate)',
      category: 'ADDITIVE',
      functionalClass: 'PRESERVATIVE',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Widely used Class II food preservative inhibiting bacterial and mold growth.',
      isWarning: false,
    },
    '220': {
      name: 'INS 220 (Sulphur Dioxide)',
      category: 'ADDITIVE',
      functionalClass: 'PRESERVATIVE',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Preservative and antioxidant preventing microbial spoilage.',
      whyFlagged: 'Contains sulphite; triggers asthma and allergic reactions in sensitive individuals.',
      isWarning: true,
      allergenTags: ['ALLERGEN_SULPHITE'],
    },
    '223': {
      name: 'INS 223 (Sodium Metabisulphite)',
      category: 'ADDITIVE',
      functionalClass: 'PRESERVATIVE',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Preservative and dough conditioner.',
      whyFlagged: 'Contains sulphite; allergen declaration depends on the applicable regulatory threshold.',
      isWarning: true,
      allergenTags: ['ALLERGEN_SULPHITE'],
    },
    '224': {
      name: 'INS 224 (Potassium Metabisulphite)',
      category: 'ADDITIVE',
      functionalClass: 'PRESERVATIVE',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Sulphite preservative and antioxidant used to control microbial spoilage.',
      whyFlagged: 'Contains sulphite; sensitive individuals, especially some people with asthma, may react.',
      isWarning: true,
      allergenTags: ['ALLERGEN_SULPHITE'],
    },
    '260': {
      name: 'INS 260 (Acetic Acid)',
      category: 'ADDITIVE',
      functionalClass: 'ACIDITY_REGULATOR',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Natural acidulant and preservative providing the characteristic acidity of vinegar.',
      isWarning: false,
    },
    '270': {
      name: 'INS 270 (Lactic Acid)',
      category: 'ADDITIVE',
      functionalClass: 'ACIDITY_REGULATOR',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Natural organic acid regulating pH and microbial stability.',
      isWarning: false,
    },
    '282': {
      name: 'INS 282 (Calcium Propionate)',
      category: 'ADDITIVE',
      functionalClass: 'PRESERVATIVE',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Preservative used in bakery products to inhibit mold growth.',
      isWarning: false,
    },
    '296': {
      name: 'INS 296 (Malic Acid)',
      category: 'ADDITIVE',
      functionalClass: 'ACIDITY_REGULATOR',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Organic fruit acid providing smooth tartness.',
      isWarning: false,
    },

    // Antioxidants & Acidulants
    '300': {
      name: 'INS 300 (Ascorbic Acid / Vitamin C)',
      category: 'ADDITIVE',
      functionalClass: 'ANTIOXIDANT',
      processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
      facts: 'Essential nutrient and natural antioxidant that prevents enzymatic browning and oxidation.',
      isWarning: false,
    },
    '301': {
      name: 'INS 301 (Sodium Ascorbate)',
      category: 'ADDITIVE',
      functionalClass: 'ANTIOXIDANT',
      processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
      facts: 'Mineral salt of vitamin C used as an antioxidant.',
      isWarning: false,
    },
    '306': {
      name: 'INS 306 (Mixed Tocopherols / Vitamin E)',
      category: 'ADDITIVE',
      functionalClass: 'ANTIOXIDANT',
      processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
      facts: 'Natural fat-soluble antioxidant preventing rancidity in oils.',
      isWarning: false,
    },
    '319': {
      name: 'INS 319 (TBHQ / Tertiary Butylhydroquinone)',
      category: 'ADDITIVE',
      functionalClass: 'ANTIOXIDANT',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic phenolic antioxidant used to retard rancidity in vegetable fats and oils.',
      whyFlagged: 'Synthetic antioxidant; usage levels strictly regulated under FSSAI.',
      isWarning: true,
    },
    '320': {
      name: 'INS 320 (BHA / Butylated Hydroxyanisole)',
      category: 'ADDITIVE',
      functionalClass: 'ANTIOXIDANT',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic antioxidant preserving fats and fat-containing foods.',
      isWarning: true,
    },
    '321': {
      name: 'INS 321 (BHT / Butylated Hydroxytoluene)',
      category: 'ADDITIVE',
      functionalClass: 'ANTIOXIDANT',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synthetic antioxidant preventing oxidative degradation of fats.',
      isWarning: true,
    },
    '322': {
      name: 'INS 322(i) (Lecithin)',
      category: 'ADDITIVE',
      functionalClass: 'EMULSIFIER',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Natural emulsifier that may be derived from soybeans, sunflower, or rapeseed; the source must be declared separately.',
      isWarning: false,
    },
    '322(i)': {
      name: 'INS 322(i) (Lecithin)',
      category: 'ADDITIVE',
      functionalClass: 'EMULSIFIER',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Natural emulsifier derived from plant sources.',
      isWarning: false,
    },
    '322i': {
      name: 'INS 322(i) (Lecithin)',
      category: 'ADDITIVE',
      functionalClass: 'EMULSIFIER',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Natural emulsifier derived from plant sources.',
      isWarning: false,
    },
    '330': {
      name: 'INS 330 (Citric Acid)',
      category: 'ADDITIVE',
      functionalClass: 'ACIDITY_REGULATOR',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Natural acidulant found in citrus fruits; regulates acidity and enhances freshness.',
      isWarning: false,
    },
    '334': {
      name: 'INS 334 (Tartaric Acid)',
      category: 'ADDITIVE',
      functionalClass: 'ACIDITY_REGULATOR',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Natural fruit acid providing characteristic tartness.',
      isWarning: false,
    },
    '338': {
      name: 'INS 338 (Orthophosphoric Acid)',
      category: 'ADDITIVE',
      functionalClass: 'ACIDITY_REGULATOR',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Inorganic acidulant providing sharp acidity in cola-type beverages.',
      whyFlagged: 'Inorganic acidulant; dental and bone effects depend on overall diet.',
      isWarning: true,
    },

    // Thickeners, Stabilizers & Gelling Agents
    '407': {
      name: 'INS 407 (Carrageenan)',
      category: 'ADDITIVE',
      functionalClass: 'THICKENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Seaweed-derived polysaccharide used as a gelling agent and stabilizer.',
      isWarning: false,
    },
    '410': {
      name: 'INS 410 (Locust Bean Gum)',
      category: 'ADDITIVE',
      functionalClass: 'THICKENER',
      processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
      facts: 'Natural seed gum from carob trees used as a thickening agent.',
      isWarning: false,
    },
    '412': {
      name: 'INS 412 (Guar Gum)',
      category: 'ADDITIVE',
      functionalClass: 'THICKENER',
      processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
      facts: 'Natural plant fiber from guar beans used as a stabilizer and texturizer.',
      isWarning: false,
    },
    '415': {
      name: 'INS 415 (Xanthan Gum)',
      category: 'ADDITIVE',
      functionalClass: 'THICKENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Fermentation-derived polysaccharide hydrocolloid used as a stabilizer and viscosity modifier.',
      isWarning: false,
    },
    '440': {
      name: 'INS 440 (Pectin)',
      category: 'ADDITIVE',
      functionalClass: 'GELLING_AGENT',
      processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
      facts: 'Natural soluble dietary fibre from fruits used as a gelling agent in jams and spreads.',
      isWarning: false,
    },
    '451(i)': {
      name: 'INS 451(i) (Pentasodium Triphosphate)',
      category: 'ADDITIVE',
      functionalClass: 'HUMECTANT',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Food-grade humectant that improves noodle dough elasticity.',
      isWarning: false,
    },
    '451': {
      name: 'INS 451 (Triphosphates)',
      category: 'ADDITIVE',
      functionalClass: 'HUMECTANT',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Food-grade humectant and texturizer.',
      isWarning: false,
    },
    '471': {
      name: 'INS 471 (Mono- and Diglycerides of Fatty Acids)',
      category: 'ADDITIVE',
      functionalClass: 'EMULSIFIER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Food emulsifier derived from plant or animal fats used to blend oil and water phases.',
      isWarning: false,
    },
    '472e': {
      name: 'INS 472e (DATEM / Diacetyl Tartaric Acid Esters)',
      category: 'ADDITIVE',
      functionalClass: 'EMULSIFIER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Dough conditioner and strengthener used in baked goods.',
      isWarning: false,
    },
    '476': {
      name: 'INS 476 (Polyglycerol Polyricinoleate / PGPR)',
      category: 'ADDITIVE',
      functionalClass: 'EMULSIFIER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Emulsifier derived from castor bean oil used to reduce chocolate viscosity during molding.',
      isWarning: false,
    },
    '1422': {
      name: 'INS 1422 (Acetylated Distarch Adipate)',
      category: 'ADDITIVE',
      functionalClass: 'THICKENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Chemically modified starch thickener resistant to acid and temperature fluctuations.',
      isWarning: false,
    },

    // Leavening & Acidity Regulators
    '500(ii)': {
      name: 'INS 500(ii) (Sodium Bicarbonate)',
      category: 'ADDITIVE',
      functionalClass: 'RAISING_AGENT',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Common baking soda used as a leavening agent to release CO2 bubbles and create crispness.',
      isWarning: false,
    },
    '500(i)': {
      name: 'INS 500(i) (Sodium Carbonate)',
      category: 'ADDITIVE',
      functionalClass: 'RAISING_AGENT',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Food-grade leavening agent and acidity regulator.',
      isWarning: false,
    },
    '500ii': {
      name: 'INS 500(ii) (Sodium Bicarbonate)',
      category: 'ADDITIVE',
      functionalClass: 'RAISING_AGENT',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Common baking soda used as a leavening agent to release CO2 bubbles and create crispness.',
      isWarning: false,
    },
    '500': {
      name: 'INS 500 (Sodium Carbonates)',
      category: 'ADDITIVE',
      functionalClass: 'RAISING_AGENT',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Food-grade leavening agent and acidity regulator (baking soda).',
      isWarning: false,
    },
    '501(i)': {
      name: 'INS 501(i) (Potassium Carbonate)',
      category: 'ADDITIVE',
      functionalClass: 'ACIDITY_REGULATOR',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Acidity regulator providing traditional alkaline dough firmness for noodles.',
      isWarning: false,
    },
    '501': {
      name: 'INS 501 (Potassium Carbonate)',
      category: 'ADDITIVE',
      functionalClass: 'ACIDITY_REGULATOR',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Acidity regulator for dough elasticity.',
      isWarning: false,
    },
    '503(ii)': {
      name: 'INS 503(ii) (Ammonium Bicarbonate)',
      category: 'ADDITIVE',
      functionalClass: 'RAISING_AGENT',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Traditional biscuit leavening agent that completely evaporates as harmless gas during baking.',
      isWarning: false,
    },
    '503ii': {
      name: 'INS 503(ii) (Ammonium Bicarbonate)',
      category: 'ADDITIVE',
      functionalClass: 'RAISING_AGENT',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Traditional biscuit leavening agent that completely evaporates as harmless gas during baking.',
      isWarning: false,
    },
    '503': {
      name: 'INS 503 (Ammonium Carbonates)',
      category: 'ADDITIVE',
      functionalClass: 'RAISING_AGENT',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Traditional biscuit leavening agent that completely evaporates during baking.',
      isWarning: false,
    },
    '508': {
      name: 'INS 508 (Potassium Chloride)',
      category: 'ADDITIVE',
      functionalClass: 'FLAVOUR_ENHANCER',
      processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
      facts: 'Mineral salt substitute often used to reduce sodium content.',
      whyFlagged: 'Potassium salt; people with kidney disease should check with a clinician rather than relying on a label verdict.',
      isWarning: true,
    },
    '551': {
      name: 'INS 551 (Silicon Dioxide)',
      category: 'ADDITIVE',
      functionalClass: 'ANTICAKING_AGENT',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Food-grade anticaking agent preventing powdered ingredients from clumping.',
      isWarning: false,
    },

    // Flavour Enhancers
    '621': {
      name: 'INS 621 (Monosodium Glutamate / MSG)',
      category: 'ADDITIVE',
      functionalClass: 'FLAVOUR_ENHANCER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Flavor enhancer providing savory umami taste.',
      statutoryWarning: 'Contains Monosodium Glutamate. Not recommended for infants below 12 months and pregnant women.',
      whyFlagged: 'FSSAI statutory warning triggered: Not recommended for infants below 12 months and pregnant women.',
      isWarning: true,
    },
    '627': {
      name: 'INS 627 (Disodium Guanylate)',
      category: 'ADDITIVE',
      functionalClass: 'FLAVOUR_ENHANCER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synergistic nucleotide savory flavor enhancer.',
      isWarning: false,
    },
    '631': {
      name: 'INS 631 (Disodium Inosinate)',
      category: 'ADDITIVE',
      functionalClass: 'FLAVOUR_ENHANCER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synergistic savory flavor enhancer.',
      isWarning: false,
    },
    '635': {
      name: 'INS 635 (Disodium 5-ribonucleotides)',
      category: 'ADDITIVE',
      functionalClass: 'FLAVOUR_ENHANCER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Synergistic savory flavor enhancer.',
      isWarning: false,
    },

    // Polyols (Sugar Alcohols)
    '420': {
      name: 'INS 420 (Sorbitol)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Sugar alcohol polyol used as a bulk sweetener and humectant.',
      statutoryWarning: 'Polyols may have laxative effect.',
      whyFlagged: 'FSSAI statutory warning: Polyols may have laxative effect.',
      isWarning: true,
    },
    '421': {
      name: 'INS 421 (Mannitol)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Sugar alcohol polyol sweetener and texturizer.',
      statutoryWarning: 'Polyols may have laxative effect.',
      whyFlagged: 'FSSAI statutory warning: Polyols may have laxative effect.',
      isWarning: true,
    },
    '953': {
      name: 'INS 953 (Isomalt)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Sugar alcohol polyol derived from sucrose.',
      statutoryWarning: 'Polyols may have laxative effect.',
      whyFlagged: 'FSSAI statutory warning: Polyols may have laxative effect.',
      isWarning: true,
    },
    '965': {
      name: 'INS 965 (Maltitol)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Sugar alcohol polyol providing clean sweetness with reduced energy value.',
      statutoryWarning: 'Polyols may have laxative effect.',
      whyFlagged: 'FSSAI statutory warning: Polyols may have laxative effect.',
      isWarning: true,
    },
    '966': {
      name: 'INS 966 (Lactitol)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Sugar alcohol polyol derived from lactose.',
      statutoryWarning: 'Polyols may have laxative effect.',
      whyFlagged: 'FSSAI statutory warning: Polyols may have laxative effect.',
      isWarning: true,
    },
    '967': {
      name: 'INS 967 (Xylitol)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Sugar alcohol polyol with cooling sweetness.',
      statutoryWarning: 'Polyols may have laxative effect.',
      whyFlagged: 'FSSAI statutory warning: Polyols may have laxative effect.',
      isWarning: true,
    },
    '968': {
      name: 'INS 968 (Erythritol)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'Fermentation-derived sugar alcohol polyol with near-zero caloric value.',
      statutoryWarning: 'Polyols may have laxative effect.',
      whyFlagged: 'FSSAI statutory warning: Polyols may have laxative effect.',
      isWarning: true,
    },

    // Artificial & High-Intensity Sweeteners
    '950': {
      name: 'INS 950 (Acesulfame Potassium)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'High-intensity non-sugar sweetener.',
      statutoryWarning: 'Contains Acesulfame Potassium. Not recommended for children.',
      whyFlagged: 'FSSAI statutory warning: Contains Acesulfame Potassium. Not recommended for children.',
      isWarning: true,
    },
    '951': {
      name: 'INS 951 (Aspartame)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'High-intensity artificial sweetener.',
      statutoryWarning: 'Contains Aspartame. Not recommended for children. Phenylketonurics: Contains Phenylalanine.',
      whyFlagged: 'FSSAI statutory warning: Contains Aspartame. Not recommended for children. Contraindicated in phenylketonuria.',
      isWarning: true,
    },
    '954': {
      name: 'INS 954 (Saccharin)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'High-intensity non-sugar sweetener.',
      statutoryWarning: 'Contains Saccharin. Not recommended for children.',
      whyFlagged: 'FSSAI statutory warning: Contains Saccharin. Not recommended for children.',
      isWarning: true,
    },
    '955': {
      name: 'INS 955 (Sucralose)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'High-intensity non-nutritive sweetener derived from sucrose.',
      statutoryWarning: 'Contains Sucralose. Not recommended for children.',
      whyFlagged: 'FSSAI statutory warning: Contains Sucralose. Not recommended for children.',
      isWarning: true,
    },
    '960': {
      name: 'INS 960 (Steviol Glycosides)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'High-intensity sweetener derived from the stevia plant.',
      statutoryWarning: 'Contains Steviol Glycosides. Not recommended for children.',
      whyFlagged: 'FSSAI statutory warning: Contains Steviol Glycosides. Not recommended for children.',
      isWarning: true,
    },
    '961': {
      name: 'INS 961 (Neotame)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'High-intensity non-sugar sweetener.',
      statutoryWarning: 'Contains Neotame. Not recommended for children.',
      whyFlagged: 'FSSAI statutory warning: Contains Neotame. Not recommended for children.',
      isWarning: true,
    },
    '962': {
      name: 'INS 962 (Aspartame-Acesulfame Salt)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'High-intensity non-sugar sweetener containing aspartame and acesulfame.',
      statutoryWarning: 'Contains Aspartame-Acesulfame Salt. Not recommended for children. Phenylketonurics: Contains Phenylalanine.',
      whyFlagged: 'FSSAI statutory warning: Contains Aspartame-Acesulfame Salt. Not recommended for children.',
      isWarning: true,
    },
    '969': {
      name: 'INS 969 (Advantame)',
      category: 'ADDITIVE',
      functionalClass: 'SWEETENER',
      processingGroup: 'GROUP_C_ULTRA_PROCESSED',
      facts: 'High-intensity non-sugar sweetener.',
      statutoryWarning: 'Contains Advantame. Not recommended for children.',
      whyFlagged: 'FSSAI statutory warning: Contains Advantame. Not recommended for children.',
      isWarning: true,
    },
  };

  // ---------------------------------------------------------------------------
  // 2. Chemical Name to INS Normalization Dictionary
  // ---------------------------------------------------------------------------
  private static readonly CHEMICAL_NAME_TO_INS: Record<string, string> = {
    'tartrazine': '102',
    'sunset yellow': '110',
    'sunset yellow fcf': '110',
    'carmoisine': '122',
    'azorubine': '122',
    'ponceau 4r': '124',
    'erythrosine': '127',
    'allura red': '129',
    'brilliant blue': '133',
    'plain caramel': '150a',
    'caramel iv': '150d',
    'titanium dioxide': '171',
    'sorbic acid': '200',
    'potassium sorbate': '202',
    'sodium benzoate': '211',
    'sulphur dioxide': '220',
    'sulfur dioxide': '220',
    'sodium metabisulphite': '223',
    'sodium metabisulfite': '223',
    'potassium metabisulphite': '224',
    'potassium metabisulfite': '224',
    'acetic acid': '260',
    'lactic acid': '270',
    'calcium propionate': '282',
    'malic acid': '296',
    'ascorbic acid': '300',
    'sodium ascorbate': '301',
    'tbhq': '319',
    'tertiary butylhydroquinone': '319',
    'bha': '320',
    'bht': '321',
    'soy lecithin': '322',
    'soya lecithin': '322',
    'lecithin': '322',
    'citric acid': '330',
    'tartaric acid': '334',
    'orthophosphoric acid': '338',
    'phosphoric acid': '338',
    'carrageenan': '407',
    'guar gum': '412',
    'xanthan gum': '415',
    'sorbitol': '420',
    'mannitol': '421',
    'pectin': '440',
    'pentasodium triphosphate': '451(i)',
    'mono- and diglycerides of fatty acids': '471',
    'mono and diglycerides': '471',
    'datem': '472e',
    'pgpr': '476',
    'polyglycerol polyricinoleate': '476',
    'sodium bicarbonate': '500(ii)',
    'sodium carbonate': '500(i)',
    'baking soda': '500(ii)',
    'potassium carbonate': '501(i)',
    'ammonium bicarbonate': '503(ii)',
    'potassium chloride': '508',
    'silicon dioxide': '551',
    'monosodium glutamate': '621',
    'msg': '621',
    'disodium guanylate': '627',
    'disodium inosinate': '631',
    'disodium 5-ribonucleotides': '635',
    'acesulfame potassium': '950',
    'acesulfame k': '950',
    'aspartame': '951',
    'isomalt': '953',
    'saccharin': '954',
    'sucralose': '955',
    'steviol glycosides': '960',
    'stevia': '960',
    'neotame': '961',
    'maltitol': '965',
    'lactitol': '966',
    'xylitol': '967',
    'erythritol': '968',
    'advantame': '969',
    'modified starch': '1422',
    'acetylated distarch adipate': '1422',
  };

  // ---------------------------------------------------------------------------
  // 3. High-Glycemic Carbohydrates
  // ---------------------------------------------------------------------------
  private static readonly HIGH_GI_CARB_MARKERS: Record<string, { fact: string; processing: ProcessingClassification }> = {
    'maltodextrin': {
      fact: 'Refined starch hydrolysate; rapidly digested industrial carbohydrate.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'modified starch': {
      fact: 'Chemically altered starch used for thickening; ultra-processed texturizer.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'dextrin': {
      fact: 'Short-chain starch hydrolysate used as a refined carbohydrate.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'refined flour': {
      fact: 'Refined cereal flour with less fibre than whole grain; culinary processed.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'refined wheat flour': {
      fact: 'Refined wheat flour (maida); culinary processed ingredient.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'maida': {
      fact: 'Refined wheat flour; culinary processed ingredient.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'white flour': {
      fact: 'Refined cereal flour; culinary processed ingredient.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
  };

  // ---------------------------------------------------------------------------
  // 4. Added Sugars Dictionary (FSSAI Reg. 2(1)(z)(ii))
  // ---------------------------------------------------------------------------
  private static readonly ADDED_SUGAR_MARKERS: Record<string, { fact: string; processing: ProcessingClassification }> = {
    'sugar': {
      fact: 'Refined cane sucrose.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'invert sugar syrup': {
      fact: 'Sucrose split into glucose and fructose to maintain moisture and sweetness.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'invert sugar': {
      fact: 'Sucrose split into glucose and fructose; industrial confectionery sugar.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'liquid glucose': {
      fact: 'Hydrolysed starch syrup containing fast-absorbing glucose and maltose; FSSAI Reg. 2(1)(z)(ii) added sugar.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'glucose syrup': {
      fact: 'Refined glucose syrup used as an industrial sweetener; FSSAI Reg. 2(1)(z)(ii) added sugar.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'corn syrup': {
      fact: 'Refined glucose-containing syrup; FSSAI Reg. 2(1)(z)(ii) added sugar.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'corn syrup solids': {
      fact: 'Dehydrated corn syrup; FSSAI Reg. 2(1)(z)(ii) added sugar.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'high fructose corn syrup': {
      fact: 'Industrial sweetener high in unbound fructose.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'rice syrup': {
      fact: 'Refined syrup containing rice-derived sugars; FSSAI Reg. 2(1)(z)(ii) added sugar.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'maltose': {
      fact: 'Disaccharide sugar; FSSAI Reg. 2(1)(z)(ii) added sugar.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'dextrose': {
      fact: 'Simple D-glucose, rapidly absorbed into bloodstream.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'khandsari': {
      fact: 'Traditional raw crystallised sugar; FSSAI Reg. 2(1)(z)(ii) added sugar.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'bura': {
      fact: 'Crushed raw unrefined sugar; FSSAI Reg. 2(1)(z)(ii) added sugar.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'jaggery': {
      fact: 'Traditional unrefined cane sugar containing sucrose.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'gur': {
      fact: 'Traditional unrefined cane sugar (jaggery).',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'honey': {
      fact: 'Natural sweetener containing free fructose and glucose.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'fructose': {
      fact: 'Monosaccharide free sugar.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'brown sugar': {
      fact: 'Refined sucrose with molasses.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
  };

  // ---------------------------------------------------------------------------
  // 5. Fats & Oils
  // ---------------------------------------------------------------------------
  private static readonly FAT_OIL_MARKERS: Record<string, { facts: string; warning?: string; processing: ProcessingClassification }> = {
    'palmolein': {
      facts: 'Refined fraction of palm oil.',
      warning: 'Refined palm fraction; use declared saturated fat value rather than an ingredient claim.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'palm oil': {
      facts: 'Tropical plant oil.',
      warning: 'Tropical plant oil; use declared saturated fat value rather than an ingredient claim.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'hydrogenated vegetable oil': {
      facts: 'Vegetable oil subjected to chemical hydrogenation; industrial trans-fat carrier.',
      warning: 'Hydrogenated fat source; potential carrier of industrial trans fatty acids.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'hydrogenated vegetable fat': {
      facts: 'Chemically hydrogenated vegetable fat.',
      warning: 'Hydrogenated fat source; strictly regulated under FSSAI trans-fat standards.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'interesterified fat': {
      facts: 'Chemically modified rearranged fatty acid triglycerides.',
      warning: 'Interesterified fat; industrial ultra-processed lipid modification.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'vanaspati': {
      facts: 'Hydrogenated vegetable fat traditionally used in Indian cooking.',
      warning: 'Hydrogenated fat source; strictly regulated under FSSAI trans-fat standards.',
      processing: 'GROUP_C_ULTRA_PROCESSED',
    },
    'butter': {
      facts: 'Dairy butterfat.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'ghee': {
      facts: 'Clarified dairy butterfat.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'sunflower oil': {
      facts: 'Vegetable oil.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'mustard oil': {
      facts: 'Cold-pressed or refined mustard seed oil.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
    'soybean oil': {
      facts: 'Refined soybean cooking oil.',
      processing: 'GROUP_B_CULINARY_INGREDIENT',
    },
  };

  private static allergenTagsForToken(lower: string, freeFromClaims: string[] = []): string[] {
    if (this.isFreeFromClaim(lower)) return [];

    const tags: string[] = [];

    // FSSAI (Labelling and Display) Regulations, 2020, Reg. 5(14)(i):
    // Mandatory gluten cereals: wheat, rye, barley, oats, spelt or their hybridized strains.
    // Statutory exemptions under Reg. 5(14)(i)(a)-(c):
    // - wheat based glucose syrups including dextrose
    // - wheat based maltodextrins
    // - glucose syrups based on barley
    // - oats qualified by gluten-free claim
    const isExemptGlutenDerivative =
      /\bwheat[-\s]+based\s+(?:maltodextrins?|glucose\s+syrups?|dextrose)\b/i.test(lower) ||
      /\bbarley[-\s]+based\s+glucose\s+syrups?\b/i.test(lower);

    const isGlutenFreeOats =
      (freeFromClaims.includes('GLUTEN_FREE') || this.isFreeFromClaim(lower)) &&
      /\b(?:oats?|oat\s+flour|rolled\s+oats?)\b/i.test(lower);

    if (
      !isExemptGlutenDerivative &&
      !isGlutenFreeOats &&
      /\b(?:wheat|maida|atta|suji|sooji|rava|semolina|durum|dalia|bulgur|barley|malt|rye|oats?|oat\s+flour|rolled\s+oats?|spelt|triticale|gluten)\b/i.test(lower)
    ) {
      tags.push('ALLERGEN_GLUTEN');
    }

    // FSSAI Reg. 5(14)(iii): Milk & milk products.
    // Exclude plant-derived butters (cocoa butter, peanut butter, shea butter, kokum butter, mango butter, almond/cashew butter, etc.)
    const withoutPlantButters = lower.replace(
      /\b(?:cocoa|peanut|groundnut|shea|kokum|mango|almond|cashew|hazelnut|soy|soya|sunflower|coconut)\s+butter\b/gi,
      ' '
    );
    if (
      /\b(?:milk|dairy|whey|casein|caseinate|butter|ghee|curd|dahi|paneer|chhena|khoya|mawa|malai|cream|cheese|yoghurt|yogurt|buttermilk|chach|lassi|lactalbumin|lactoglobulin|milk\s*(?:solids?|powder))\b/i.test(
        withoutPlantButters
      )
    ) {
      tags.push('ALLERGEN_MILK');
    }
    if (/prawn|crab|shrimp|crustacean|langoustine/i.test(lower)) tags.push('ALLERGEN_CRUSTACEAN');
    if (/\bfish\b|anchovy|tuna|salmon|marine\s+gelatin/i.test(lower)) tags.push('ALLERGEN_FISH');
    if (/peanut|groundnut|moongphali|arachis/i.test(lower)) tags.push('ALLERGEN_PEANUT');
    if (/almond|cashew|pistachio|walnut|hazelnut|pecan|macadamia|tree\s*nut/i.test(lower)) tags.push('ALLERGEN_TREE_NUT');
    if (/soy|soya/i.test(lower)) tags.push('ALLERGEN_SOY');
    if (/\begg\b|\beggs\b|albumin|ovalbumin/i.test(lower) && !/eggless/i.test(lower)) tags.push('ALLERGEN_EGG');
    if (/sulphite|sulfite|sulphur\s*dioxide|sulfur\s*dioxide|metabisulphite|metabisulfite/i.test(lower)) {
      tags.push('ALLERGEN_SULPHITE');
    }
    return Array.from(new Set(tags));
  }

  private static advisoryTagsForToken(lower: string): string[] {
    if (this.isFreeFromClaim(lower)) return [];
    const tags: string[] = [];
    if (/sesame|til\b/i.test(lower)) tags.push('ADVISORY_SESAME');
    if (/mustard|\brai\b/i.test(lower)) tags.push('ADVISORY_MUSTARD');
    if (/lactose/i.test(lower)) tags.push('ADVISORY_LACTOSE');
    return Array.from(new Set(tags));
  }

  private static isFreeFromClaim(lower: string): boolean {
    return /\b(?:gluten|wheat|milk|dairy|soy|soya|egg|nut|peanut|sesame|mustard)[-\s]*free\b|\bfree\s+from\s+(?:gluten|wheat|milk|dairy|soy|soya|egg|nuts?|peanut|sesame|mustard)\b|\beggless\b/i.test(lower);
  }

  private static freeFromClaimsIn(text: string): string[] {
    const claims = new Set<string>();
    const patterns: Array<[RegExp, string]> = [
      [/\bgluten[-\s]*free\b/gi, 'GLUTEN_FREE'],
      [/\bwheat[-\s]*free\b/gi, 'WHEAT_FREE'],
      [/\bmilk[-\s]*free\b/gi, 'MILK_FREE'],
      [/\bdairy[-\s]*free\b/gi, 'DAIRY_FREE'],
      [/\bsoy[-\s]*free\b/gi, 'SOY_FREE'],
      [/\bsoya[-\s]*free\b/gi, 'SOY_FREE'],
      [/\beggless\b/gi, 'EGGLESS'],
      [/\bnut[-\s]*free\b/gi, 'NUT_FREE'],
      [/\bpeanut[-\s]*free\b/gi, 'PEANUT_FREE'],
    ];
    for (const [pattern, label] of patterns) {
      if (pattern.test(text)) claims.add(label);
    }
    return Array.from(claims);
  }

  /**
   * Splits top-level segments respecting nested parentheses and brackets.
   */
  public static splitTopLevel(text: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of text) {
      if (char === '(' || char === '[') depth++;
      if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
      if ((char === ',' || char === ';') && depth === 0) {
        if (current.trim()) result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  /**
   * Recursively decomposes an Indian ingredient text string into atomic tokens.
   */
  public static tokenize(rawText: string): string[] {
    if (!rawText || typeof rawText !== 'string') return [];

    const flatten = (segment: string): string[] => {
      // Parentheses in an INS code are part of the code, not a nested list
      if (/^\s*(?:(?:ins|e)\s*)?\d{3,4}\s*\([a-z0-9]+\)\s*$/i.test(segment)) {
        return [segment.trim()];
      }
      const openIndex = segment.search(/[\[\(]/);
      if (openIndex < 0) return [segment.trim()].filter(Boolean);

      const open = segment[openIndex];
      const close = open === '(' ? ')' : ']';
      let depth = 0;
      let closeIndex = -1;
      for (let i = openIndex; i < segment.length; i++) {
        if (segment[i] === open) depth++;
        if (segment[i] === close) {
          depth--;
          if (depth === 0) {
            closeIndex = i;
            break;
          }
        }
      }

      if (closeIndex < 0) return [segment.trim()].filter(Boolean);

      const parent = segment.slice(0, openIndex).trim();
      const inner = segment.slice(openIndex + 1, closeIndex);
      const suffix = segment.slice(closeIndex + 1).trim();

      // If the bracket only contains a percentage (e.g. "Oats (48%)"), keep it with the parent
      if (/^\s*\d+(?:\.\d+)?%\s*$/.test(inner)) {
        const combined = `${parent} (${inner.trim()})`.trim();
        return [combined, ...(suffix ? flatten(suffix) : [])];
      }

      return [
        ...(parent ? [parent] : []),
        ...IngredientParser.splitTopLevel(inner).flatMap(flatten),
        ...(suffix ? flatten(suffix) : []),
      ];
    };

    return this.splitTopLevel(rawText)
      .flatMap(flatten)
      .filter((token) => !/^\s*\d+(?:\.\d+)?%\s*$/.test(token));
  }

  /**
   * Extracts declared percentage if present in the token (e.g. "Oats (48%)" -> 48).
   */
  private static extractPercentage(token: string): number | undefined {
    const match = token.match(/\b(\d+(?:\.\d+)?)\s*%/);
    return match ? parseFloat(match[1]) : undefined;
  }

  /**
   * Audits Quantitative Ingredient Declarations (QUID) under FSSAI Regulation 5(2)(g)
   * and Compound Ingredient rules under Regulation 5(2)(e).
   */
  public static auditQuid(
    productName: string = '',
    claims: string[] = [],
    decoded: DecodedIngredient[],
    rawIngredientsText: string = ''
  ): QuidAuditResult {
    const textToScan = `${productName} ${claims.join(' ')}`.toLowerCase();
    const emphasizedKeywords = [
      'oat', 'oats', 'wheat', 'atta', 'almond', 'badam', 'kaju', 'cashew',
      'honey', 'chocolate', 'choco', 'cocoa', 'fruit', 'berries', 'cranberry',
      'butter', 'ghee', 'milk', 'peanut', 'makhana', 'fox nut', 'hazelnut',
      'pistachio', 'pista', 'ragi', 'millet', 'bajra', 'soy', 'soya',
      'ginger', 'garlic', 'cardamom', 'elaichi',
    ];

    const detectedEmphasized: string[] = [];
    for (const kw of emphasizedKeywords) {
      const reg = new RegExp(`\\b${kw}\\b`, 'i');
      if (reg.test(textToScan)) {
        detectedEmphasized.push(kw);
      }
    }

    const compliantDeclarations: Array<{ ingredient: string; percentage: number }> = [];
    const nonCompliantDeclarations: Array<{ ingredient: string; reason: string }> = [];
    const summary: string[] = [];

    // 1. Check Regulation 5(2)(g): Emphasized ingredients must declare ingoing percentage
    for (const emp of detectedEmphasized) {
      const matched = decoded.find((d) => d.normalizedName.toLowerCase().includes(emp) || d.rawToken.toLowerCase().includes(emp));
      if (matched && matched.declaredPercentage !== undefined) {
        compliantDeclarations.push({ ingredient: emp, percentage: matched.declaredPercentage });
        summary.push(`✓ QUID Compliant: '${emp}' ingoing percentage declared as ${matched.declaredPercentage}%.`);
      } else {
        const reason = `Statutory QUID Non-Compliance: Ingredient '${emp}' is emphasized in product name or claims, but lacks mandatory quantitative percentage (% w/w or % v/v) under FSSAI Regulation 5(2)(g).`;
        nonCompliantDeclarations.push({ ingredient: emp, reason });
        summary.push(`⚠️ ${reason}`);
      }
    }

    // 2. Check Regulation 5(2)(e): Compound Ingredients >= 5% must declare bracketed sub-list
    const compoundIngredients: QuidAuditResult['compoundIngredients'] = [];
    if (rawIngredientsText) {
      const topSegments = this.splitTopLevel(rawIngredientsText);
      for (const seg of topSegments) {
        const pct = this.extractPercentage(seg);
        const hasBrackets = /[\[\(].*[,;].*[\]\)]/.test(seg);
        const nameMatch = seg.match(/^([^(\[]+)/);
        const name = nameMatch ? nameMatch[1].trim() : seg.trim();

        if (pct !== undefined && pct >= 5.0) {
          const isComp = !/^(?:whole\s+wheat|atta|rice|milk|sugar|water|salt)$/i.test(name);
          if (isComp) {
            if (hasBrackets) {
              compoundIngredients.push({
                name,
                percentage: pct,
                hasSubList: true,
                isCompliant: true,
              });
              summary.push(`✓ Regulation 5(2)(e) Compliant: Compound ingredient '${name}' (${pct}%) declares sub-ingredients.`);
            } else {
              const reason = `Compound ingredient '${name}' is declared at ${pct}% (>= 5%) but lacks mandatory descending sub-ingredients declaration under FSSAI Regulation 5(2)(e).`;
              compoundIngredients.push({
                name,
                percentage: pct,
                hasSubList: false,
                isCompliant: false,
                reason,
              });
              summary.push(`⚠️ Statutory Non-Compliance: ${reason}`);
            }
          }
        }
      }
    }

    return {
      hasEmphasizedIngredients: detectedEmphasized.length > 0,
      emphasizedIngredients: detectedEmphasized,
      compliantDeclarations,
      nonCompliantDeclarations,
      compoundIngredients,
      summary,
    };
  }

  /**
   * Decodes and classifies all tokens against the authoritative knowledge base.
   */
  public static parse(
    ingredientsText?: string,
    productName?: string,
    claims: string[] = []
  ): {
    totalTokens: number;
    classifiedCount: number;
    coveragePercent: number;
    decoded: DecodedIngredient[];
    unclassifiedTokens: string[];
    allergenTagsDetected: string[];
    statutoryAllergenTags: string[];
    advisoryTags: string[];
    mayContainAllergenTags: string[];
    freeFromClaims: string[];
    statutoryWarningsTriggered: StatutoryWarningTrigger[];
    quidAudit: QuidAuditResult;
    processingClassificationSummary: {
      groupACount: number;
      groupBCount: number;
      groupCCount: number;
      isUltraProcessed: boolean;
    };
  } {
    if (!ingredientsText) {
      return {
        totalTokens: 0,
        classifiedCount: 0,
        coveragePercent: 100,
        decoded: [],
        unclassifiedTokens: [],
        allergenTagsDetected: [],
        statutoryAllergenTags: [],
        advisoryTags: [],
        mayContainAllergenTags: [],
        freeFromClaims: [],
        statutoryWarningsTriggered: [],
        quidAudit: {
          hasEmphasizedIngredients: false,
          emphasizedIngredients: [],
          compliantDeclarations: [],
          nonCompliantDeclarations: [],
          compoundIngredients: [],
          summary: [],
        },
        processingClassificationSummary: {
          groupACount: 0,
          groupBCount: 0,
          groupCCount: 0,
          isUltraProcessed: false,
        },
      };
    }

    const mayContainMatch = ingredientsText.match(/\bmay\s+contain\b\s*[:\-]?\s*([\s\S]*)$/i);
    const mayContainText = mayContainMatch?.[1]?.trim() ?? '';
    const mainIngredientsText = mayContainMatch && mayContainMatch.index !== undefined
      ? ingredientsText.slice(0, mayContainMatch.index)
      : ingredientsText;

    const freeFromClaims = this.freeFromClaimsIn(`${productName ?? ''} ${mainIngredientsText}`);
    const mayContainTags = new Set<string>();
    if (mayContainText) {
      for (const token of this.tokenize(mayContainText)) {
        const lower = token.toLowerCase();
        this.allergenTagsForToken(lower, freeFromClaims).forEach((tag) => mayContainTags.add(tag));
        this.advisoryTagsForToken(lower).forEach((tag) => mayContainTags.add(tag));
      }
    }

    const rawTokens = this.tokenize(mainIngredientsText);
    const decoded: DecodedIngredient[] = [];
    const unclassifiedTokens: string[] = [];
    const allergenSet = new Set<string>();
    const advisorySet = new Set<string>();
    const statutoryWarningsTriggered: StatutoryWarningTrigger[] = [];

    const recordWarning = (ruleId: string, substance: string, declaration: string, reference: string) => {
      if (!statutoryWarningsTriggered.some((w) => w.substance === substance && w.mandatoryDeclaration === declaration)) {
        statutoryWarningsTriggered.push({
          ruleId,
          substance,
          mandatoryDeclaration: declaration,
          regulatoryReference: reference,
          isTriggered: true,
        });
      }
    };

    for (const token of rawTokens) {
      const declaredPercentage = this.extractPercentage(token);
      // Clean token for normalized identification
      const cleanToken = token.replace(/\b\d+(\.\d+)?%\b/g, '').replace(/[()\[\]]/g, '').trim();
      const lower = cleanToken.toLowerCase();

      if (!lower) continue;

      const tokenFreeFrom = this.isFreeFromClaim(lower);
      const tokenAdvisoryTags = this.advisoryTagsForToken(lower);
      let matched = false;

      if (tokenFreeFrom) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: [],
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'FREE_FROM',
          facts: 'Pack carries a free-from claim. It is tracked as a claim, not as proof that the food is allergen-safe.',
          isWarning: false,
        });
        matched = true;
        continue;
      }

      // 1. Check INS Additive Database & Chemical Names
      const rawLower = token.toLowerCase();
      const explicitInsMatch = /vitamin\s*e/i.test(rawLower)
        ? null
        : rawLower.match(/\b(?:ins|e)\s*([0-9]{3,4})(?:\s*\(\s*([a-z0-9]+)\s*\)|\s*([a-z0-9]+))?/i);
      const standaloneCodeMatch = !explicitInsMatch && /^\s*([0-9]{3,4})(?:\s*\(\s*([a-z0-9]+)\s*\)|\s*([a-z0-9]+))?\s*$/i.test(rawLower)
        ? rawLower.match(/^\s*([0-9]{3,4})(?:\s*\(\s*([a-z0-9]+)\s*\)|\s*([a-z0-9]+))?\s*$/i)
        : null;
      const insMatch = explicitInsMatch || standaloneCodeMatch;

      let matchedCode: string | undefined;
      if (insMatch) {
        const suffix = (insMatch[2] || insMatch[3])?.toLowerCase();
        const parenthesisedSuffix = Boolean(suffix && /\(\s*[a-z0-9]+\s*\)/i.test(insMatch[0]));
        matchedCode = `${insMatch[1]}${suffix ? (parenthesisedSuffix ? `(${suffix})` : suffix) : ''}`.toLowerCase();
      } else {
        // Try chemical name normalization
        for (const [chemName, code] of Object.entries(this.CHEMICAL_NAME_TO_INS)) {
          if (lower.includes(chemName)) {
            matchedCode = code;
            break;
          }
        }
      }

      if (matchedCode) {
        const sulphiteCode = Number(matchedCode.replace(/\D/g, ''));
        const info = this.INS_REGISTRY[matchedCode]
          || this.INS_REGISTRY[matchedCode.replace(/[()]/g, '')]
          || (sulphiteCode >= 220 && sulphiteCode <= 228
            ? {
                name: `INS ${sulphiteCode} (Sulphite preservative)`,
                category: 'ADDITIVE' as const,
                functionalClass: 'PRESERVATIVE' as FunctionalClass,
                processingGroup: 'GROUP_C_ULTRA_PROCESSED' as ProcessingClassification,
                facts: 'Sulphite preservative used to reduce oxidation and microbial spoilage.',
                whyFlagged: 'Contains sulphite; sensitive individuals may react.',
                isWarning: true,
                allergenTags: ['ALLERGEN_SULPHITE'],
              }
            : undefined);

        if (info) {
          const allergenTags = Array.from(
            new Set([...(info.allergenTags || []), ...this.allergenTagsForToken(lower, freeFromClaims)])
          );
          const statutoryWarnings: string[] = [];
          if (info.statutoryWarning) {
            statutoryWarnings.push(info.statutoryWarning);
            recordWarning('FSSAI_SCHED_II', info.name, info.statutoryWarning, 'FSSAI (Labelling and Display) Regulations 2020, Schedule II');
          }

          decoded.push({
            rawToken: token,
            normalizedName: info.name,
            category: info.category,
            insCode: matchedCode,
            functionalClass: info.functionalClass,
            processingGroup: info.processingGroup,
            statutoryWarnings: statutoryWarnings.length > 0 ? statutoryWarnings : undefined,
            declaredPercentage,
            allergenTags,
            advisoryTags: tokenAdvisoryTags,
            allergenStatus: allergenTags.length > 0 ? 'CONTAINS' : 'NONE',
            facts: info.facts,
            whyFlagged: info.whyFlagged,
            isWarning: info.isWarning,
          });

          allergenTags.forEach((t) => allergenSet.add(t));
          tokenAdvisoryTags.forEach((t) => advisorySet.add(t));
          matched = true;
          continue;
        }
      }

      // 2. Check Added Sugars (FSSAI Reg. 2(1)(z)(ii) checked before High-GI Carbs so syrups are tagged ADDED_SUGAR)
      for (const [marker, conf] of Object.entries(this.ADDED_SUGAR_MARKERS)) {
        if (lower.includes(marker)) {
          decoded.push({
            rawToken: token,
            normalizedName: marker.toUpperCase(),
            category: 'ADDED_SUGAR',
            functionalClass: 'NATURAL_BASE_INGREDIENT',
            processingGroup: conf.processing,
            declaredPercentage,
            allergenTags: [],
            advisoryTags: tokenAdvisoryTags,
            allergenStatus: 'NONE',
            facts: conf.fact,
            whyFlagged: 'Contributes to added free sugar intake.',
            isWarning: true,
          });
          tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 3. Check High-Glycemic Carbohydrates
      for (const [marker, conf] of Object.entries(this.HIGH_GI_CARB_MARKERS)) {
        if (lower.includes(marker)) {
          const allergenTags = this.allergenTagsForToken(lower, freeFromClaims);
          decoded.push({
            rawToken: token,
            normalizedName: marker.toUpperCase(),
            category: 'HIGH_GI_CARB',
            functionalClass: 'NATURAL_BASE_INGREDIENT',
            processingGroup: conf.processing,
            declaredPercentage,
            allergenTags,
            advisoryTags: tokenAdvisoryTags,
            allergenStatus: allergenTags.length > 0 ? 'CONTAINS' : 'NONE',
            facts: conf.fact,
            whyFlagged: 'Refined carbohydrate source; interpret alongside total carbohydrate, fibre, and portion size.',
            isWarning: true,
          });
          allergenTags.forEach((tag) => allergenSet.add(tag));
          tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 4. Check Fats & Oils
      for (const [marker, val] of Object.entries(this.FAT_OIL_MARKERS)) {
        if (lower.includes(marker)) {
          const allergenTags = this.allergenTagsForToken(lower, freeFromClaims);
          decoded.push({
            rawToken: token,
            normalizedName: marker.toUpperCase(),
            category: 'FAT_OIL',
            functionalClass: 'NATURAL_BASE_INGREDIENT',
            processingGroup: val.processing,
            declaredPercentage,
            allergenTags,
            advisoryTags: tokenAdvisoryTags,
            allergenStatus: allergenTags.length > 0 ? 'CONTAINS' : 'NONE',
            facts: val.facts,
            whyFlagged: val.warning,
            isWarning: !!val.warning,
          });
          allergenTags.forEach((tag) => allergenSet.add(tag));
          tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // Generic functional class recognition when INS is omitted
      if (/raising\s+agent|emulsifier|thickener|stabilizer|acidity\s+regulator|preservative|flavou?ring|colour|color|vitamin|mineral/i.test(lower)) {
        let fClass: FunctionalClass = 'NATURAL_BASE_INGREDIENT';
        if (/raising\s+agent/i.test(lower)) fClass = 'RAISING_AGENT';
        else if (/emulsifier/i.test(lower)) fClass = 'EMULSIFIER';
        else if (/thickener/i.test(lower)) fClass = 'THICKENER';
        else if (/stabilizer/i.test(lower)) fClass = 'STABILIZER';
        else if (/acidity\s+regulator/i.test(lower)) fClass = 'ACIDITY_REGULATOR';
        else if (/preservative/i.test(lower)) fClass = 'PRESERVATIVE';
        else if (/colour|color/i.test(lower)) fClass = 'COLOUR';

        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'ADDITIVE',
          functionalClass: fClass,
          processingGroup: 'GROUP_C_ULTRA_PROCESSED',
          declaredPercentage,
          allergenTags: [],
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'NONE',
          facts: 'Declared functional ingredient class; exact substance should be checked against its INS code where present.',
          isWarning: false,
        });
        tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
        matched = true;
        continue;
      }

      // 5. Check Allergens, Base Grains, Whole Foods & Staples
      const allergenTags = this.allergenTagsForToken(lower, freeFromClaims);
      const allergenMatch = allergenTags[0]
        ? { tag: allergenTags[0], facts: 'Ingredient associated with a registered allergen category.' }
        : undefined;

      if (allergenMatch) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags,
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'CONTAINS',
          facts: allergenMatch.facts,
          isWarning: false,
        });
        allergenTags.forEach((tag) => allergenSet.add(tag));
        tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
        matched = true;
      } else if (/\b(?:wheat|maida|atta|suji|sooji|rava|semolina|durum|dalia|bulgur|barley|malt|rye|spelt|triticale)\b/i.test(lower)) {
        const isWhole = !lower.includes('maida') && !lower.includes('refined') && !lower.includes('suji') && !lower.includes('sooji') && !lower.includes('rava') && !lower.includes('semolina');
        const allergenTags = this.allergenTagsForToken(lower, freeFromClaims);
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: isWhole ? 'GROUP_A_MINIMALLY_PROCESSED' : 'GROUP_B_CULINARY_INGREDIENT',
          declaredPercentage,
          allergenTags,
          facts: 'Cereal grain containing gluten protein.',
          isWarning: false,
        });
        allergenTags.forEach((t) => allergenSet.add(t));
        matched = true;
      } else if (lower.includes('milk') || lower.includes('whey') || lower.includes('casein')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: ['ALLERGEN_MILK'],
          facts: 'Dairy derivative containing milk solids and lactose.',
          isWarning: false,
        });
        allergenSet.add('ALLERGEN_MILK');
        matched = true;
      } else if (lower.includes('lactose')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
          declaredPercentage,
          allergenTags: [],
          advisoryTags: ['ADVISORY_LACTOSE'],
          allergenStatus: 'NONE',
          facts: 'Milk sugar; relevant to lactose intolerance rather than milk-protein allergy.',
          isWarning: false,
        });
        advisorySet.add('ADVISORY_LACTOSE');
        matched = true;
      } else if (lower.includes('cocoa') || lower.includes('chocolate')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: [],
          facts: 'Solids derived from cacao beans.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('salt') || lower.includes('iodised salt')) {
        const isIodised = /\biodi[sz]ed\b/.test(lower);
        decoded.push({
          rawToken: token,
          normalizedName: isIodised ? 'Iodised Salt' : cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
          declaredPercentage,
          allergenTags: [],
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'NONE',
          facts: isIodised
            ? 'Sodium chloride supplemented with iodine.'
            : 'Sodium chloride; iodine status is not stated on this ingredient token.',
          isWarning: false,
        });
        tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
        matched = true;
      } else if (
        lower.includes('spice') ||
        lower.includes('masala') ||
        lower.includes('chilli') ||
        lower.includes('turmeric') ||
        lower.includes('coriander') ||
        lower.includes('cumin') ||
        lower.includes('garlic') ||
        lower.includes('ginger') ||
        lower.includes('onion') ||
        lower.includes('pepper') ||
        lower.includes('clove') ||
        lower.includes('cardamom') ||
        lower.includes('fenugreek') ||
        lower.includes('aniseed') ||
        lower.includes('nutmeg') ||
        lower.includes('tomato')
      ) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: [],
          facts: 'Natural spice, culinary herb or vegetable seasoning.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('starch') || lower.includes('water')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
          declaredPercentage,
          allergenTags: [],
          facts: 'Culinary staple base component.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('caffeine')) {
        const caffeineWarning = 'Contains Caffeine. Not recommended for children, pregnant or lactating women.';
        recordWarning('FSSAI_CAFFEINE', 'Caffeine', caffeineWarning, 'FSSAI (Labelling and Display) Regulations 2020');
        decoded.push({
          rawToken: token,
          normalizedName: 'Caffeine',
          category: 'ADDITIVE',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_C_ULTRA_PROCESSED',
          declaredPercentage,
          statutoryWarnings: [caffeineWarning],
          allergenTags: [],
          facts: 'Caffeine is a stimulant; intake advice depends on age, pregnancy, and medical conditions.',
          whyFlagged: 'Caffeine-containing ingredient; statutory declaration triggered under FSSAI.',
          isWarning: true,
        });
        matched = true;
      } else if (lower.includes('wheat bran')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Wheat Bran',
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: ['ALLERGEN_GLUTEN'],
          facts: 'Outer layer of the wheat grain; fibre content must come from the nutrition panel.',
          isWarning: false,
        });
        allergenSet.add('ALLERGEN_GLUTEN');
        matched = true;
      } else if (lower.includes('oat')) {
        const isGlutenFreeOats = freeFromClaims.includes('GLUTEN_FREE') || this.isFreeFromClaim(lower);
        const allergenTags = isGlutenFreeOats ? [] : this.allergenTagsForToken(lower);
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags,
          facts: isGlutenFreeOats
            ? 'Gluten-free oats; certified under FSSAI gluten-free standard (<20 ppm gluten).'
            : 'Whole-grain oat cereal; mandatory gluten declaration under FSSAI Reg. 5(14)(i) unless certified gluten-free.',
          isWarning: false,
        });
        allergenTags.forEach((t) => allergenSet.add(t));
        matched = true;
      } else if (lower.includes('moth bean') || lower.includes('moth flour') || lower.includes('gram flour') || lower.includes('besan') || lower.includes('chana')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: [],
          facts: 'Traditional Indian pulse staple; composition varies by product and preparation.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('makhana') || lower.includes('fox nut') || lower.includes('gorgon nut')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Roasted Makhana',
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: [],
          facts: 'Popped water lily seeds; composition varies by product and preparation.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('coconut water')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Tender Coconut Water',
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: [],
          facts: 'Liquid endosperm of green coconuts; composition varies by product.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('vinegar')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
          declaredPercentage,
          allergenTags: [],
          facts: 'Fermented culinary condiment providing mild acetic acidity.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('cranberr')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Cranberries',
          category: 'BASE_FOOD',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_A_MINIMALLY_PROCESSED',
          declaredPercentage,
          allergenTags: [],
          facts: 'Dried fruit; check the nutrition panel for added sugar and declared nutrients.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('cottonseed') || lower.includes('olive oil') || lower.includes('coconut oil')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'FAT_OIL',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: 'GROUP_B_CULINARY_INGREDIENT',
          declaredPercentage,
          allergenTags: [],
          facts: 'Culinary plant oil used for cooking and texture.',
          isWarning: false,
        });
        matched = true;
      }

      // 6. Safety Net: If unclassified, capture explicitly
      if (!matched) {
        unclassifiedTokens.push(token);
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'UNCLASSIFIED',
          functionalClass: 'NATURAL_BASE_INGREDIENT',
          processingGroup: undefined,
          declaredPercentage,
          allergenTags: [],
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'NONE',
          facts: 'Unclassified ingredient awaiting verification review.',
          isWarning: false,
        });
        tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
      }
    }

    const totalTokens = rawTokens.length;
    const classifiedCount = totalTokens - unclassifiedTokens.length;
    const coveragePercent = totalTokens > 0
      ? Number(((classifiedCount / totalTokens) * 100).toFixed(1))
      : 100;

    // Processing classification summary
    let groupACount = 0;
    let groupBCount = 0;
    let groupCCount = 0;
    for (const d of decoded) {
      if (d.processingGroup === 'GROUP_A_MINIMALLY_PROCESSED') groupACount++;
      else if (d.processingGroup === 'GROUP_B_CULINARY_INGREDIENT') groupBCount++;
      else if (d.processingGroup === 'GROUP_C_ULTRA_PROCESSED') groupCCount++;
    }

    // Run QUID Audit
    const quidAudit = this.auditQuid(productName, claims, decoded, mainIngredientsText);

    return {
      totalTokens,
      classifiedCount,
      coveragePercent,
      decoded,
      unclassifiedTokens,
      allergenTagsDetected: Array.from(allergenSet),
      statutoryAllergenTags: Array.from(allergenSet),
      advisoryTags: Array.from(advisorySet),
      mayContainAllergenTags: Array.from(mayContainTags),
      freeFromClaims,
      statutoryWarningsTriggered,
      quidAudit,
      processingClassificationSummary: {
        groupACount,
        groupBCount,
        groupCCount,
        isUltraProcessed: groupCCount > 0,
      },
    };
  }
}
