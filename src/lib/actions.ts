"use client";

import { newId, putBlob } from "@/lib/blob-store";
import {
  prepareFromCanvas,
  prepareUpload,
  renderSampleDesign,
  renderSampleWall,
  type PreparedImage,
} from "@/lib/image-utils";
import type { Design, Project, Wall } from "@/lib/types";
import { useAppStore } from "@/store/app-store";

/** Higher-level data operations that touch both the store and the blob store. */

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, "") || "Untitled";

async function saveWall(
  projectId: string,
  name: string,
  img: PreparedImage,
  extra: Partial<Wall> = {},
): Promise<Wall> {
  const imageId = newId("img");
  const thumbId = newId("thm");
  await Promise.all([putBlob(imageId, img.blob), putBlob(thumbId, img.thumb)]);
  const wall: Wall = {
    id: newId("wal"),
    projectId,
    name,
    imageId,
    thumbId,
    width: img.width,
    height: img.height,
    surface: "other",
    notes: "",
    createdAt: Date.now(),
    ...extra,
  };
  useAppStore.getState().addWall(wall);
  return wall;
}

async function saveDesign(
  projectId: string,
  title: string,
  img: PreparedImage,
  source: Design["source"],
): Promise<Design> {
  const imageId = newId("img");
  const thumbId = newId("thm");
  await Promise.all([putBlob(imageId, img.blob), putBlob(thumbId, img.thumb)]);
  const design: Design = {
    id: newId("dsg"),
    projectId,
    batchId: newId("bat"),
    status: "ready",
    imageId,
    thumbId,
    width: img.width,
    height: img.height,
    prompt: "",
    fullPrompt: "",
    styleId: source,
    paletteId: "free",
    providerId: source,
    model: source,
    seed: 0,
    title,
    favorite: false,
    chosen: false,
    source,
    createdAt: Date.now(),
  };
  useAppStore.getState().addDesign(design);
  return design;
}

export async function uploadWalls(projectId: string, files: File[]): Promise<Wall[]> {
  const out: Wall[] = [];
  for (const file of files) {
    const img = await prepareUpload(file);
    out.push(await saveWall(projectId, baseName(file), img));
  }
  return out;
}

export async function uploadDesigns(projectId: string, files: File[]): Promise<Design[]> {
  const out: Design[] = [];
  for (const file of files) {
    const img = await prepareUpload(file, 3072);
    out.push(await saveDesign(projectId, baseName(file), img, "upload"));
  }
  return out;
}

export async function addSampleWall(projectId: string): Promise<Wall> {
  const img = await prepareFromCanvas(renderSampleWall());
  return saveWall(projectId, "Sample brick wall", img, {
    surface: "brick",
    widthM: 8,
    heightM: 5,
    notes: "Procedurally generated practice wall. Try masking around the window and drainpipe.",
  });
}

export async function addSampleDesigns(projectId: string): Promise<Design[]> {
  const out: Design[] = [];
  for (let v = 0; v < 2; v++) {
    const img = await prepareFromCanvas(renderSampleDesign(v));
    out.push(await saveDesign(projectId, `Sample artwork ${v + 1}`, img, "sample"));
  }
  return out;
}

/** A ready-to-explore project: sample wall + two sample designs. */
export async function createSampleProject(): Promise<Project> {
  const project = useAppStore.getState().createProject({
    name: "Sample · Brick alley",
    description: "A practice project so you can try the studio without uploading anything.",
    location: "Demo street",
    tags: ["sample"],
    status: "designing",
  });
  await addSampleWall(project.id);
  await addSampleDesigns(project.id);
  return project;
}
