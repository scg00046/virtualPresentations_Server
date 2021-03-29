const mysql = require('./conexion_bbdd');
const jwt = require('jwt-simple');

const TAG = 'pizarravirtual'
module.exports.TAG = TAG;

exports.autenticacion = function (request, response, next) {

    //Validar AUTH
    if (!request.header('Autenticacion')) {
        return response.status(401).send('Es necesario autenticarse en la aplicación, la sesión no es válida');
    }
    console.log('Método: ', request.method, ' - URL: ', request.originalUrl, ' - Body: ', request.body);
    try {
        var token = request.header('Autenticacion');
        var payload = {};

        payload = jwt.decode(token, TAG);
        request.idUsuario = payload.id;
        request.usuario = payload.nombreusuario;

        mysql.compruebaToken(payload.id, token).then(()=>{
            next();
        }).catch(()=>{
            response.status(401).send('El token no es válido');
        })

        /* Validar CADUCIDAD del TOKEN
        if (payload.exp <= moment().unix()) {
            return response.status(419).send({ message: i18n.__('AUTHEXP') });
        }

        //Validar CADUCIDAD del la SESION
        var query_auth = "UPDATE  \
          seg_users_sessions_active \
        SET exp_token=DATE_ADD(fn_now_tz(), INTERVAL ? MINUTE) \
        WHERE \
          seg_users_sessions_active.exp_token>fn_now_tz() \
          AND seg_users_sessions_active.login = ?  \
          AND seg_users_sessions_active.token = ? LIMIT 1";
        query_auth = database.mysql.format(query_auth, [config.SESSION_TIME, request.user, request.token]);
        database.pool.getConnection(function (err, connection) {
            if (err) {
                console.error(err);
                return response.status(500).send({ message: err });
            } else {
                connection.query(query_auth, function (err, rows_auth, flds_auth) {
                    if (err) {
                        console.error(err);
                        return response.status(500).send({ message: err });
                    } else {
                        if (rows_auth.affectedRows == 1) {
                            next();
                        } else {
                            return response.status(401).send({ message: i18n.__('WRONGSES') });
                        }
                    }
                });
            }
            connection.release();
        });
*/
    }
    catch (err) {
        return response.status(401).send('Token inválido');
    }

}