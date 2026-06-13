import { PRODUCT_EXERCISE_DATA, EQUIPMENT_SCENARIOS } from "@/data/directory/exercise-product-links";

export interface ResolvedEquipment {
  availableProducts: string[];
  compatibleExercises: CompatibleExercise[];
  recommendedSubstitutions: Substitution[];
  unavailableProductsWithAlternatives: ProductAlternative[];
}

export interface CompatibleExercise {
  name: string;
  relatedProduct: string;
  trainingMethod: string;
  physicalQuality: string;
  priority: number;
}

export interface Substitution {
  goal: string;
  withProduct: string;
  withoutProduct: string[];
  preservedMethod: string;
  preservedQuality: string;
}

export interface ProductAlternative {
  product: string;
  alternativeExercises: string[];
  note: string;
}

/**
 * Given a list of available products, return:
 * - All exercises compatible with that equipment
 * - Substitution recommendations for common missing equipment
 * - Alternative exercises when key products are unavailable
 */
export function resolveAvailableEquipment(
  availableProducts: string[]
): ResolvedEquipment {
  const normalizedAvailable = new Set(
    availableProducts.map((p) => p.toLowerCase().trim())
  );

  const compatibleExercises: CompatibleExercise[] = [];
  const unavailableProductsWithAlternatives: ProductAlternative[] = [];

  // Walk every product we have data for
  for (const [productName, data] of Object.entries(PRODUCT_EXERCISE_DATA)) {
    const isAvailable = normalizedAvailable.has(productName.toLowerCase());

    if (isAvailable) {
      // Add PRIMARY and SUPPORTED_BY exercises as compatible
      for (const ex of data.relatedExercises) {
        if (ex.relationshipType === "PRIMARY" || ex.relationshipType === "SUPPORTED_BY") {
          compatibleExercises.push({
            name: ex.name,
            relatedProduct: productName,
            trainingMethod: ex.trainingMethod ?? "",
            physicalQuality: ex.physicalQuality ?? "",
            priority: ex.relationshipType === "PRIMARY" ? 1 : 2,
          });
        }
      }
    } else {
      // Collect substitutions for unavailable products
      const subs = data.relatedExercises.filter(
        (ex) =>
          ex.relationshipType === "SUBSTITUTION" ||
          ex.relationshipType === "ALTERNATIVE"
      );
      if (subs.length > 0) {
        unavailableProductsWithAlternatives.push({
          product: productName,
          alternativeExercises: subs.map((s) => s.name),
          note: data.substitutionRule?.note ?? "",
        });
      }
    }
  }

  // Build scenario-based substitution recommendations
  const recommendedSubstitutions: Substitution[] = EQUIPMENT_SCENARIOS.map(
    (scenario) => {
      const hasProduct = normalizedAvailable.has(
        scenario.withEquipment.product.toLowerCase()
      );
      return {
        goal: scenario.goal,
        withProduct: scenario.withEquipment.product,
        withoutProduct: hasProduct
          ? scenario.withEquipment.exercises
          : scenario.withoutEquipment.alternatives,
        preservedMethod: hasProduct
          ? scenario.withEquipment.method
          : scenario.withoutEquipment.method,
        preservedQuality: scenario.withoutEquipment.adaptationPreserved,
      };
    }
  );

  // Sort compatible exercises by priority
  compatibleExercises.sort((a, b) => a.priority - b.priority);

  return {
    availableProducts,
    compatibleExercises,
    recommendedSubstitutions,
    unavailableProductsWithAlternatives,
  };
}

/**
 * Get all exercises that support a specific training method,
 * filtered by available equipment.
 */
export function getExercisesForMethod(
  methodName: string,
  availableProducts: string[]
): CompatibleExercise[] {
  const resolved = resolveAvailableEquipment(availableProducts);
  return resolved.compatibleExercises.filter(
    (ex) =>
      ex.trainingMethod.toLowerCase().includes(methodName.toLowerCase())
  );
}

/**
 * Given a product name, return the substitution exercises when unavailable.
 */
export function getSubstitutionsForProduct(productName: string): {
  exercises: string[];
  preservedMethod: string;
  preservedQuality: string;
  note: string;
} | null {
  const data = PRODUCT_EXERCISE_DATA[productName];
  if (!data?.substitutionRule) return null;

  return {
    exercises: data.substitutionRule.withoutProduct.map((e) => e.name),
    preservedMethod: data.substitutionRule.preservedMethod,
    preservedQuality: data.substitutionRule.preservedQuality,
    note: data.substitutionRule.note,
  };
}
