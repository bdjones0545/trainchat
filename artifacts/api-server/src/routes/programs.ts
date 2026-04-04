import { Router, type IRouter } from "express";
import { db, savedProgramsTable, programDaysTable, exercisesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateProgramBody, GetProgramParams, DeleteProgramParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/programs", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const programs = await db
    .select()
    .from(savedProgramsTable)
    .where(eq(savedProgramsTable.userId, userId))
    .orderBy(savedProgramsTable.createdAt);

  res.json(programs.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: p.name,
    description: p.description ?? null,
    conversationId: p.conversationId ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  })));
});

router.post("/programs", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;

  const [program] = await db.insert(savedProgramsTable).values({
    userId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    conversationId: parsed.data.conversationId ?? null,
  }).returning();

  // Insert days and exercises
  for (const day of parsed.data.days) {
    const [programDay] = await db.insert(programDaysTable).values({
      programId: program.id,
      dayNumber: day.dayNumber,
      name: day.name,
      notes: day.notes ?? null,
    }).returning();

    for (const exercise of day.exercises) {
      await db.insert(exercisesTable).values({
        programDayId: programDay.id,
        name: exercise.name,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        rest: exercise.rest ?? null,
        notes: exercise.notes ?? null,
        orderIndex: exercise.orderIndex,
      });
    }
  }

  res.status(201).json({
    id: program.id,
    userId: program.userId,
    name: program.name,
    description: program.description ?? null,
    conversationId: program.conversationId ?? null,
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
  });
});

router.get("/programs/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetProgramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [program] = await db.select().from(savedProgramsTable).where(eq(savedProgramsTable.id, params.data.id));

  if (!program || program.userId !== userId) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  const days = await db.select().from(programDaysTable).where(eq(programDaysTable.programId, program.id));

  const daysWithExercises = await Promise.all(
    days.map(async (day) => {
      const exercises = await db
        .select()
        .from(exercisesTable)
        .where(eq(exercisesTable.programDayId, day.id))
        .orderBy(exercisesTable.orderIndex);

      return {
        id: day.id,
        programId: day.programId,
        dayNumber: day.dayNumber,
        name: day.name,
        notes: day.notes ?? null,
        exercises: exercises.map((e) => ({
          id: e.id,
          programDayId: e.programDayId,
          name: e.name,
          sets: e.sets ?? null,
          reps: e.reps ?? null,
          rest: e.rest ?? null,
          notes: e.notes ?? null,
          orderIndex: e.orderIndex,
        })),
      };
    })
  );

  res.json({
    id: program.id,
    userId: program.userId,
    name: program.name,
    description: program.description ?? null,
    conversationId: program.conversationId ?? null,
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
    days: daysWithExercises,
  });
});

router.delete("/programs/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProgramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [program] = await db.select().from(savedProgramsTable).where(eq(savedProgramsTable.id, params.data.id));

  if (!program || program.userId !== userId) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  await db.delete(savedProgramsTable).where(eq(savedProgramsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
