// SmartQ API – Express + Prisma + PostgreSQL
// Developer: Şeyma Yıldırım

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { CONFIG } from "./config/config.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { successResponse, errorResponse } from "./utils/responseHelper.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import authRoutes from "./routes/authRoutes.js";

dotenv.config();
const app = express();
const prisma = new PrismaClient();

/* ===========================
   🔧 Global Middleware
=========================== */
app.use(requestLogger);
app.use(cors());
app.use(express.json());

/* ===========================
   🔐 Auth Routes
=========================== */
app.use("/auth", authRoutes);

/* ===========================
   ✅ Test Endpoint
=========================== */
app.get("/", (req, res) => successResponse(res, null, "SmartQ API is running ✅"));

/* ===========================
   👩‍🎓 Öğrenciler
=========================== */
app.get("/students", authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        let students = [];

        if (user.role === "admin") {
            students = await prisma.student.findMany({
                include: { parent: true, school: true },
            });
        } else if (user.role === "manager") {
            const school = await prisma.school.findFirst({ where: { managerId: user.id } });
            if (school) {
                students = await prisma.student.findMany({
                    where: { schoolId: school.id },
                    include: { parent: true, school: true },
                });
            }
        } else if (user.role === "teacher") {
            const teacher = await prisma.teacher.findFirst({ where: { userId: user.id } });
            if (teacher) {
                students = await prisma.student.findMany({
                    where: {
                        schoolId: teacher.schoolId,
                        grade: teacher.className,
                    },
                    include: { parent: true, school: true },
                });
            }
        } else if (user.role === "parent") {
            const parent = await prisma.parent.findFirst({ where: { userId: user.id } });
            if (parent) {
                students = await prisma.student.findMany({
                    where: { parentId: parent.id },
                    include: { parent: true, school: true },
                });
            }
        } else if (user.role === "student") {
            const student = await prisma.student.findFirst({
                where: { userId: user.id },
                include: { parent: true, school: true },
            });
            if (student) students = [student];
        } else {
            return errorResponse(res, "Bu işlem için yetkiniz yok", 403);
        }

        return successResponse(res, students, "Öğrenciler başarıyla listelendi");
    } catch (err) {
        console.error(err);
        return errorResponse(res, "Öğrenciler listelenirken hata oluştu");
    }
});

/* ===========================
   🎓 Okullar
=========================== */
app.get("/schools", authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        let schools = [];

        if (user.role === "admin") {
            schools = await prisma.school.findMany({
                include: { students: true, teachers: true },
            });
        } else if (user.role === "manager") {
            schools = await prisma.school.findMany({
                where: { managerId: user.id },
                include: { students: true, teachers: true },
            });
        } else {
            schools = await prisma.school.findMany({
                where: {
                    OR: [
                        { students: { some: { userId: user.id } } },
                        { teachers: { some: { userId: user.id } } },
                    ],
                },
                include: { students: true, teachers: true },
            });
        }

        return successResponse(res, schools, "Okullar başarıyla listelendi");
    } catch (err) {
        console.error(err);
        return errorResponse(res, "Okullar listelenirken hata oluştu");
    }
});

// 🔒 Okul güncelleme – sadece admin
app.patch("/schools/:id", authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return errorResponse(res, "Bu işlem için admin yetkisi gerekli", 403);
        }

        const schoolId = parseInt(req.params.id);
        const { name, managerId } = req.body;

        const updatedSchool = await prisma.school.update({
            where: { id: schoolId },
            data: {
                ...(name && { name }),
                ...(managerId && { managerId }),
            },
            include: { students: true, teachers: true },
        });

        return successResponse(res, updatedSchool, "Okul bilgileri güncellendi");
    } catch (err) {
        console.error(err);
        return errorResponse(res, "Okul güncellenirken bir hata oluştu");
    }
});

/* ===========================
   👩‍🏫 Öğretmenler
=========================== */
app.get("/teachers", authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        let teachers = [];

        if (user.role === "admin") {
            teachers = await prisma.teacher.findMany({
                include: { school: true },
            });
        } else if (user.role === "manager") {
            const school = await prisma.school.findFirst({ where: { managerId: user.id } });
            if (school) {
                teachers = await prisma.teacher.findMany({
                    where: { schoolId: school.id },
                    include: { school: true },
                });
            }
        } else if (user.role === "teacher") {
            teachers = await prisma.teacher.findMany({
                where: { userId: user.id },
                include: { school: true },
            });
        } else {
            return errorResponse(res, "Bu işlem için yetkiniz yok", 403);
        }

        return successResponse(res, teachers, "Öğretmenler başarıyla listelendi");
    } catch (err) {
        console.error(err);
        return errorResponse(res, "Öğretmenler listelenirken hata oluştu");
    }
});

// 🔒 Öğretmen güncelleme – sadece admin
app.patch("/teachers/:id", authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return errorResponse(res, "Bu işlem için admin yetkisi gerekli", 403);
        }

        const teacherId = parseInt(req.params.id);
        const { name, subject, className, userId } = req.body;

        const updatedTeacher = await prisma.teacher.update({
            where: { id: teacherId },
            data: {
                ...(name && { name }),
                ...(subject && { subject }),
                ...(className && { className }),
                ...(userId && { user: { connect: { id: userId } } }),
            },
            include: { school: true, user: true },
        });

        return successResponse(res, updatedTeacher, "Öğretmen bilgileri güncellendi");
    } catch (err) {
        console.error(err);
        return errorResponse(res, "Öğretmen güncellenirken bir hata oluştu");
    }
});

/* ===========================
   👨‍👩‍👧 Veliler
=========================== */
app.get("/parents", authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        let parents = [];

        if (user.role === "admin") {
            parents = await prisma.parent.findMany({
                include: { students: true },
            });
        } else if (user.role === "manager") {
            const school = await prisma.school.findFirst({ where: { managerId: user.id } });
            if (school) {
                parents = await prisma.parent.findMany({
                    where: { students: { some: { schoolId: school.id } } },
                    include: { students: true },
                });
            }
        } else if (user.role === "teacher") {
            const teacher = await prisma.teacher.findFirst({ where: { userId: user.id } });
            if (teacher) {
                parents = await prisma.parent.findMany({
                    where: {
                        students: {
                            some: {
                                schoolId: teacher.schoolId,
                                grade: teacher.className,
                            },
                        },
                    },
                    include: { students: true },
                });
            }
        } else if (user.role === "parent") {
            const parent = await prisma.parent.findFirst({ where: { userId: user.id } });
            if (parent) {
                parents = [
                    await prisma.parent.findUnique({
                        where: { id: parent.id },
                        include: { students: true },
                    }),
                ];
            }
        } else {
            return errorResponse(res, "Bu işlem için yetkiniz yok", 403);
        }

        return successResponse(res, parents, "Veliler başarıyla listelendi");
    } catch (err) {
        console.error(err);
        return errorResponse(res, "Veliler listelenirken hata oluştu");
    }
});

/* ===========================
   🚨 Error Handling
=========================== */
app.use((req, res) => errorResponse(res, `URL bulunamadı: ${req.originalUrl}`, 404));
app.use(errorHandler);

/* ===========================
   🚀 Server Start
=========================== */
const PORT = CONFIG.port;
app.listen(PORT, () => {
    console.log(`🚀 ${CONFIG.appName} is running on port ${PORT} (${CONFIG.env} mode)`);
});
