/**
 * Servicio de presentación virtual controlado desde terminal móvil.
 * 
 * @author Sergio Caballero Garrido
 */
//Librerías necesarias
var express = require('express');
var path = require('path');
var app = express();
var bodyParser = require('body-parser'); //Recibe los datos enviados en los formularios
var mysql = require('./conexion_bbdd'); //Conexión a la base de datos

//Constantes
const puerto = 8080;
const rutadef = '/virtualpresentation';
const login = rutadef+'/usuario';

//
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Obtener los recursos necesarios para la página web
//app.use('/public/css', express.static(__dirname + '/css'));
//app.use('/public/js', express.static(__dirname + '/js'));
//app.use('/public/img', express.static(__dirname + '/img'));



// Formulario de login
app.get(login, function (request, response) {
	response.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post(login, function (request, response) {
    var username = request.body.user;
    var password = request.body.password;
	if (username && password) {

		mysql.buscausuario(username).then((usuario) => {
			console.log('El usuario buscado es: ' + usuario.nombreusuario);
			
			if (username == usuario.nombreusuario && password == usuario.password) {
				var user = {
					nombreusuario: usuario.nombreusuario,
					nombre: usuario.nombre,
					apellidos: usuario.apellidos
				};
				//Responde con código 200 y el objeto usuario
				response.status(200).send('OK:'+Object.values(user));
			} else {
				response.send('ERROR 2: Usuario o contraseña incorrectos!');
			}
		}).catch((error) => {
			response.send(error);
		}).finally(() => { response.end(); });
	} else {
		response.send('ERROR 1: Intruduzca sus datos de usuario!');
		response.end();
	}
});

app.listen(puerto, () => { console.log(`Servidor Presentación virtual:
http://localhost:${puerto}/virtualpresentation`) });