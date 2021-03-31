CREATE DATABASE `presentacionvirtual` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

-- TABLA USUARIOS --
CREATE TABLE `usuarios` (
  `idusuario` int NOT NULL AUTO_INCREMENT,
  `nombreusuario` varchar(45) NOT NULL,
  `password` varchar(45) DEFAULT NULL,
  `nombre` varchar(45) DEFAULT NULL,
  `apellidos` varchar(45) DEFAULT NULL,
  `email` varchar(45) DEFAULT NULL,
  `token` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`idusuario`,`nombreusuario`),
  KEY `FK_nombreusuario` (`nombreusuario`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLA PRESENTACIONES: --
CREATE TABLE `presentaciones` (
  `idpresentacion` int NOT NULL AUTO_INCREMENT,
  `presentacion` varchar(100) DEFAULT NULL,
  `paginas` int DEFAULT NULL,
  `nombreusuario` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`idpresentacion`),
  UNIQUE KEY `Pres_usuario_index` (`presentacion`,`nombreusuario`),
  KEY `FK_nombreusuario_idx` (`nombreusuario`),
  CONSTRAINT `FK_nombreusuario` FOREIGN KEY (`nombreusuario`) REFERENCES `usuarios` (`nombreusuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLA SESIONES --
CREATE TABLE `sesiones` (
  `idsesion` int NOT NULL AUTO_INCREMENT,
  `sesion` varchar(50) NOT NULL,
  `presentacion` varchar(100) NOT NULL,
  `usuario` varchar(45) NOT NULL,
  PRIMARY KEY (`sesion`,`usuario`),
  UNIQUE KEY `idsesion_UNIQUE` (`idsesion`),
  KEY `FK_usuario_idx` (`usuario`),
  KEY `FK_presentacion_idx` (`presentacion`),
  CONSTRAINT `FK_presentacion` FOREIGN KEY (`presentacion`) REFERENCES `presentaciones` (`presentacion`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_usuario` FOREIGN KEY (`usuario`) REFERENCES `usuarios` (`nombreusuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;