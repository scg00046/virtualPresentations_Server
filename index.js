/**
 * Servicio de presentación virtual controlado desde terminal móvil.
 * 
 * @author Sergio Caballero Garrido
 */
//Librerías necesarias
const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require('body-parser'); //Recibe los datos enviados en los formularios
const fileUpload = require('express-fileupload'); //Para subir ficheros
const fs = require('fs');
const pdfData = require('pdf-page-counter'); //Obtener datos de la presentación
const pdfjsdist = require('pdfjs-dist'); //Lector pdf, utilizado en la vista
const qrcode = require('qrcode');
const https = require('https'); //npm i http
const io = require('socket.io'); //npm i socket.io
const random = require('randomstring');
const swaggerUi = require('swagger-ui-express');

const mysql = require('./conexion_bbdd'); //Conexión a la base de datos
const midd = require('./middleware');
const certs = path.join(__dirname, 'certs', 'vPresentation');

//REST
const puerto = 8080;
const rutadef = '/virtualpresentation';
/** Formulario (get) y envío de credenciales (post)
 * /virtualpresentation/usuario */
const urlLogin = rutadef + '/usuario';
/** (get) devuelve presentaciones almacenadas
 *  (put) almacena una nueva presentación
 *  (post) elimina una presentación
 * /virtualpresentation/:usuario */
const urlUsuario = rutadef + '/:usuario';
/** Crear y borrar (delete) sesión
 * /virtualpresentation/session/:usuario */
const urlcreaSesion = rutadef + '/sesion/:usuario';
/** Mostrar qr  
 * /virtualpresentation/:usuario/:nombresesion */
const urlpresentacion = urlUsuario + '/:nombresesion';

//Configuración datos recibidos
app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('case sensitive routing', true); //URL sensibles a mayusculas
app.set('view engine', 'ejs'); //Motor de vistas

//Cabeceras y métodos
app.use(function (req, res, next) {
	var methods = 'GET,POST,PUT,DELETE'
	res.header('Access-Control-Allow-Methods', methods);
	(methods.split(',').find(m => m == req.method)) ? next() : res.sendStatus(405);
});

//Desarrollo
// const morgan = require('morgan');
// app.use(morgan('dev'));

//Obtener los recursos necesarios para la página web
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/private', express.static(path.join(__dirname, 'private')));
app.use('/pdf-reader', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist')));

//Documentación de la API
const swaggerDocument = require('./public/swagger.json');
var swaggerOptions = {
	explorer: true,
	customCss: '.swagger-ui .topbar { display: none }',
	customSiteTitle: 'Presentación virtual - Documentación',
	customfavIcon: '/public/uja.ico',
	swaggerOptions: {
		url: `http://localhost:8080/virtualpresentation/swagger.json`
	}
};
app.use(rutadef + '/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));

//Opciones para el QR
const qrOp = {
	errorCorrectionLevel: 'H',
	type: 'image/jpeg',
	quality: 0.3,
	margin: 1,
	color: {
		dark: "#027507FF",
		light: "#FFFFFFFF"
	}
}

/* Registro de usuario */
app.put(urlLogin, function (request, response) {
	var usuario = request.body;

	if (usuario.nombreusuario && usuario.password && usuario.nombre) {
		mysql.buscausuario(usuario.nombreusuario).then((usuario) => {
			response.status(409).send("El usuario ya existe");
		}).catch((error) => {
			if (error == 'No se encuentra el usuario!') {
				mysql.registraUsuario(usuario).then(function (resp) {
					response.status(200).send(resp);
				}).catch((error) => {
					response.status(500).send(error);
				});
			} else {
				response.status(500).send(error);
			}
		});
	} else {
		response.status(400).send('No se han recibido datos');
	}

});

/* Acceso de credenciales */
app.post(urlLogin, function (request, response) {
	var username = request.body.user;
	var password = request.body.password;
	if (username && password) {

		mysql.buscausuario(username).then((usuario) => {

			if (username == usuario.nombreusuario && password == usuario.password) {
				var user = {
					id: usuario.id,
					nombreusuario: usuario.nombreusuario,
					nombre: usuario.nombre,
					apellidos: usuario.apellidos
				};
				user['token'] = midd.generateToken(user);
				mysql.actualizaToken(user.id, user.token).then(r => {
					response.status(200).send(user); //Responde con código 200 y el objeto usuario
				}).catch(err => {
					response.status(500).send(err);
				});
			} else {
				response.status(401).send("Usuario o contraseña incorrectos!");
			}
		}).catch((error) => {
			if (error == 'No se encuentra el usuario!') {
				response.status(401).send("Usuario o contraseña incorrectos!");
			} else {
				response.status(500).send(error);
			}
		});
	} else {
		response.status(400).send('Intruduzca sus datos de usuario!');
	}
});

/* Cierre de sesión de usuario */
app.get(urlLogin, midd.authorization, function (request, response) {
	mysql.eliminaToken(request.idUsuario, request.header('Autenticacion')).then(r => {
		response.status(200).send(r);
	}).catch(e => {
		response.status(500).send(e);
	});
});

/* Petición get a /virtualpresentation/usuario
	Devuelve las presentaciones almacenadas para seleccionarla 
	desde la aplicación */
app.get(urlUsuario, midd.authorization, function (request, response) {
	var usuario = request.params.usuario;
	if (usuario == request.usuario) {
		mysql.buscaPresentaciones(request.usuario).then((listaPresentaciones) => {
			response.status(200).send(listaPresentaciones);
		}).catch((error) => {
			if (error == 'Lista vacía') {
				response.status(204).send([]);
			} else {
				response.status(500).send(error);
			}
		});
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});

/* Subida de presentación al servidor */
app.put(urlUsuario, midd.authorization, function (request, response) {
	var usuario = request.params.usuario;
	var presentacion = request.files?.presentacion;

	if (usuario == request.usuario && presentacion) {
		if (!request.files || Object.keys(request.files).length === 0 || presentacion.mimetype != 'application/pdf') {
			return response.status(400).send('No se ha subido ningún archivo');
		} else {
			//Comprobación de usuario
			mysql.compruebaPresentacion(request.usuario, presentacion.name).then((result) => {

				if (result == 'OK') {
					var directorioUsuario = path.join(__dirname, 'private', usuario);
					var directorioPresentacion = path.join(__dirname, 'private', usuario, presentacion.name);

					//Comprobación directorio del usuario
					fs.mkdir(directorioUsuario, (e) => {
						/*if (e) {
							return console.log('Error: ' + e.code);
						}*/
					});
					//Añadir presentación al directorio y a la base de datos
					presentacion.mv(directorioPresentacion, function (err) {
						if (err) {
							// console.error('Error al guardar la presentación: ' + err.code);
							return response.status(500).send(err);
						} else {
							//Obtener el número de páginas y agregarlo a la base de datos
							pdfData(presentacion).then(function (datos) {
								var paginas = datos.numpages;
								mysql.creaPresentacion(presentacion.name, paginas, usuario).then((respuesta) => {
									if (respuesta == 'OK') {
										//crear json para notas fijas
										var notasPresentacion = presentacion.name.split('.pdf')[0] + '.json';
										var listaNotas = path.join(directorioUsuario, notasPresentacion);
										fs.writeFile(listaNotas, '[]', function (err) {
											if (err) return err;
										});
										response.status(200).send('Presentación almacenada');
									}
								}).catch(e => {
									// console.error('Error en el registro en la bbdd: ', e);
									//Elimina el fichero si no se ha podido registrar
									fs.unlink(directorioPresentacion, (err) => {
										if (err) console.error('Error al Eliminar fichero: ' + err);
									});
									response.status(500).send(e);
								});
							}).catch(error => {
								//Elimina el fichero si no se ha podido registrar
								fs.unlink(directorioPresentacion, (err) => {
									if (err) console.error('Error al Eliminar fichero: ' + err);
								});
								response.status(500).send(error);
							});
						}
					});
				}
			}).catch((error) => { //La presentación está registrada o se ha producido un error en la base de datos
				if (error == 'La presentación ya existe') {
					response.status(409).send(error);
				} else {
					response.status(500).send(error);
				}
			});
		}
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});
/* Eliminar presentación almacenada */
app.delete(urlUsuario, midd.authorization, function (request, response) {
	var usuario = request.params.usuario;
	var presentacion = request.headers.presentacion;

	if (usuario == request.usuario && presentacion) {

		var directorioPresentacion = path.join(__dirname, 'private', usuario, presentacion);
		try {
			fs.unlinkSync(directorioPresentacion);
			var notasPresentacion = presentacion.split('.pdf')[0] + '.json';
			var listaNotas = path.join(__dirname, 'private', usuario, notasPresentacion);
			fs.unlinkSync(listaNotas);
			mysql.eliminaPresentacion(presentacion, usuario).then((respuesta) => {
				if (respuesta == 'OK') {
					response.status(200).send('Eliminado correctamente');
				}
			}).catch((e) => {
				response.status(500).send('Error en la base de datos: ' + e);
			});
		} catch (err) {
			response.status(500).send('No se ha podido eliminar');
		}

	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});

/* Petición get a /virtualpresentation/session/usuario
	Devuelve las sesiones creadas por el usuario */
app.get(urlcreaSesion, midd.authorization, function (request, response) {
	var usuario = request.params.usuario;
	if (usuario == request.usuario) {
		mysql.buscaSesiones(request.usuario).then((listaSesiones) => {
			response.status(200).send(listaSesiones);
		}).catch((error) => {
			if (error == 'Lista vacía') {
				response.status(204).send([]);
			} else {
				response.status(500).send(error);
			}
		});
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});

/*Petición para crear sesión
Atributos necesarios: nombresesion; presentacion;
*/
app.post(urlcreaSesion, midd.authorization, function (request, response) {
	var usuario = request.params.usuario; //de la propia url
	var sesion_req = request.body.sesion;
	var presentacion = request.body.presentacion;

	if (usuario == request.usuario && sesion_req && presentacion) {
		mysql.registraSesion(sesion_req, presentacion, usuario).then(s => {
			response.status(200).send(s);
		}).catch(e => {
			response.status(500).send(e);
		});
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});

//Finaliza la sesión
app.delete(urlcreaSesion, midd.authorization, function (request, response) {
	var usuario = request.params.usuario;
	var sesion = request.headers.sesion;

	if (usuario == request.usuario && sesion) {

		mysql.eliminaSesion(sesion, usuario).then(resp => {
			response.status(200).send('Sesión eliminada correctamente');
		}).catch(e => {
			response.status(500).send(e);
		});
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});

/* Mostrará un código qr (con el nombre de la sesión y usuario)
	y redirecciona cuando reciba OK de la aplicación */
app.get(urlpresentacion, function (request, response) {
	var usuario = request.params.usuario;
	var nombresesion = request.params.nombresesion;

	var rand = random.generate({
		length: 5,
		charset: 'alphanumeric'
	});
	mysql.buscaSesionUsuario(usuario, nombresesion).then(sesion => {
		sesion.codigo = rand;
		var jsonSesion = JSON.stringify(sesion);
		var sesionCodigo = sesion.sesion + '_' + rand;
		qrcode.toDataURL(jsonSesion, qrOp, function (err, url) {
			var notasPresentacion = sesion.presentacion.split('.pdf')[0] + '.json';
			var rutaNotas = path.join(__dirname, 'private', sesion.usuario, notasPresentacion);
			var listaNotas = JSON.parse(fs.readFileSync(rutaNotas, 'utf8'));
			response.status(200).render(path.join(__dirname, 'public', 'presentation.ejs'),
				{ 'sesion': sesion, 'qr': url, 'listaNotas': listaNotas, 'sesionCodigo': sesionCodigo });
		});
	}).catch(e => {
		if (e == 'La sesión no existe') {
			response.status(400).render(path.join(__dirname, 'public', 'errorsession.ejs'), { 'usuario': usuario, 'sesion': nombresesion });
		} else {
			response.status(500).send(e);
		}
	});
});

app.all('*', function (request, response) {
	response.status(404).send(`No se ha encontrado el recurso: http://${request.headers.host}${request.url}`);
});

const httpsServer = https.createServer({
	key: fs.readFileSync(certs + '.key'),
	cert: fs.readFileSync(certs + '.crt')
}, app);
httpsServer.listen(puerto, () => {
	console.log(`Servidor Presentación virtual:
https://localhost:${puerto}/virtualpresentation`)
});

/* WEBSOCKET */
const ioServer = io(httpsServer, { path: '/virtualpresentation/socket.io' });
// Conexión de clientes socket
ioServer.on('connection', (socket) => {
	// console.log('Usuario conectado: ', socket.id);
	//Recepción de mensajes
	socket.on('virtualPresentations', (msg) => {
		var nombresesion = msg.sesion;
		var s = msg.sesion.split('_')[0]; //Sesión sin el código
		// console.log('Mensaje (' + nombresesion + '): ',msg);
		if (msg.eliminar) {
			mysql.buscaSesionUsuario(msg.usuario, s).then(sesion => {
				var notasPresentacion = sesion.presentacion.split('.pdf')[0] + '.json';
				var rutaNotas = path.join(__dirname, 'private', sesion.usuario, notasPresentacion);
				var listaNotas = JSON.parse(fs.readFileSync(rutaNotas, 'utf8'));
				var idx = listaNotas.findIndex(n => n.id == msg.eliminar);
				(idx > 0) ? listaNotas.splice(idx, 1) : null;
				fs.writeFileSync(rutaNotas, JSON.stringify(listaNotas, null, 1));
			}).catch(e => { console.error(e) });
		} else {
			if (msg.fijar) {
				mysql.buscaSesionUsuario(msg.usuario, s).then(sesion => {
					var notasPresentacion = sesion.presentacion.split('.pdf')[0] + '.json';
					var rutaNotas = path.join(__dirname, 'private', sesion.usuario, notasPresentacion);
					var listaNotas = JSON.parse(fs.readFileSync(rutaNotas, 'utf8'));
					let nota = {
						id: listaNotas.length + '_' + getFecha() + '_' + msg.pagina,
						fecha: getFecha(),
						nota: msg.nota,
						pagina: msg.pagina
					}
					listaNotas.push(nota);
					fs.writeFileSync(rutaNotas, JSON.stringify(listaNotas, null, 1));
					ioServer.emit(nombresesion, Object.assign(msg, nota));
				}).catch(e => { console.error(e) });
			} else {
				ioServer.emit(nombresesion, msg);
			}
		}
	});
	//Desconexión de usuario
	socket.on('disconnect', () => {
		console.log('Usuario desconectado, id:', socket.id);
	});
});

function getFecha() {
	var hoy = new Date();
	return hoy.getDate() + '/' + (hoy.getMonth() + 1) + '/' + hoy.getFullYear();
}

