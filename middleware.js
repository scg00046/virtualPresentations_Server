const mysql = require('./conexion_bbdd');
const jwt = require('jwt-simple');
const moment = require('moment');

const TAG = 'pizarravirtual'

function authorization(request, response, next) {

    //Validar AUTH
    if (!request.header('Authorization')) {
        return response.status(401).send('Es necesario autenticarse en la aplicación, la sesión no es válida');
    }
    //console.log('Método: ', request.method, ' - URL: ', request.originalUrl, ' - Body: ', request.body);
    try {
        var token = request.header('Authorization').split(' ')[1];
        var payload = {};

        payload = jwt.decode(token, TAG);
        request.idUsuario = payload.id;
        request.usuario = payload.nickname;

        mysql.compruebaToken(payload.id, token).then(() => {
            //Validar expiración del token
            if (payload.exp <= moment().unix()) {
                return response.status(419).send('El token ha expirado');
            } else {
                next();
            }
        }).catch(() => {
            response.status(401).send('El token no es válido');
        })
    }
    catch (err) {
        if (err.message == 'Token expired') {
            return response.status(419).send('El token ha expirado');
        } else {
            return response.status(401).send('Token inválido');
        }
    }

}

function generateToken(user) {
    var payload = {
        id: user.id,
        nickname: user.nombreusuario,
        name: user.nombre + ' ' + user.apellidos,
        iat: moment().unix(),
        exp: moment().add(2, 'days').unix()
    };
    var token = jwt.encode(payload, TAG);
    return token;
}

module.exports = {
    authorization: authorization,
    generateToken: generateToken
}